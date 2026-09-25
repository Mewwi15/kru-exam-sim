-- ระบบข้อสอบจำลอง วิชาครู
-- ทุกตารางเปิด RLS แต่ไม่มี policy: เบราว์เซอร์ (anon key) อ่าน/เขียนตรงไม่ได้
-- การเข้าถึงทั้งหมดผ่าน Next.js route handler ที่ใช้ service role และฟังก์ชันด้านล่าง

create table public.rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  title text not null check (char_length(title) between 1 and 80),
  teacher_token text not null,
  teacher_channel text not null,
  duration_sec integer not null check (duration_sec between 60 and 21600),
  status text not null default 'waiting' check (status in ('waiting', 'running', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.attempts (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references public.rooms (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 60),
  seat_no integer not null default 0,
  exam_code text not null,
  token text not null,
  status text not null default 'waiting' check (status in ('waiting', 'running', 'submitted')),
  duration_sec integer not null,
  started_at timestamptz,
  deadline timestamptz,
  submitted_at timestamptz,
  score smallint not null default 0,
  answered smallint not null default 0,
  used_sec integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index attempts_room_idx on public.attempts (room_id, seat_no);
create index attempts_room_updated_idx on public.attempts (room_id, updated_at);
create unique index attempts_room_exam_code_idx on public.attempts (room_id, exam_code);
create index attempts_solo_board_idx on public.attempts (score desc, used_sec asc)
  where room_id is null and status = 'submitted';

create table public.answers (
  attempt_id uuid not null references public.attempts (id) on delete cascade,
  q smallint not null check (q between 1 and 500),
  choice smallint check (choice between 0 and 4), -- null = ผู้สอบล้างคำตอบข้อนี้
  correct boolean not null,
  updated_at timestamptz not null default now(),
  primary key (attempt_id, q)
);

create index answers_updated_idx on public.answers (updated_at);

-- ทุกครั้งที่ข้อมูลผู้สอบเปลี่ยน ให้ updated_at เปลี่ยนตาม (หน้าครูใช้ดึงเฉพาะส่วนที่เปลี่ยน)
create or replace function public._touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger attempts_touch before update on public.attempts
for each row execute function public._touch_updated_at();

alter table public.rooms enable row level security;
alter table public.attempts enable row level security;
alter table public.answers enable row level security;

-- ปิดคำตอบที่เลยเวลาแล้วให้เป็น "ส่งแล้ว" (ใช้ร่วมกันหลายฟังก์ชัน)
create or replace function public._finalize_attempt(p_attempt uuid)
returns public.attempts
language sql
as $$
  update public.attempts
  set status = 'submitted',
      submitted_at = coalesce(submitted_at, now()),
      used_sec = least(duration_sec, greatest(0, extract(epoch from (now() - started_at))::int))
  where id = p_attempt and status = 'running'
  returning *;
$$;

-- เริ่มสอบเดี่ยว: เริ่มจับเวลาทันที
create or replace function public.create_solo_attempt(p_name text, p_exam_code text, p_token text, p_duration_sec int)
returns jsonb
language plpgsql
as $$
declare
  a public.attempts;
begin
  insert into public.attempts (name, exam_code, token, status, duration_sec, started_at, deadline)
  values (p_name, p_exam_code, p_token, 'running', p_duration_sec, now(), now() + make_interval(secs => p_duration_sec))
  returning * into a;
  return jsonb_build_object('id', a.id, 'examCode', a.exam_code, 'seatNo', a.seat_no);
end;
$$;

-- นักเรียนเข้าห้อง: ได้ลำดับที่นั่งและรหัสผู้สอบ ถ้าห้องเริ่มแล้วจะเริ่มสอบทันทีด้วยเวลาที่เหลือของห้อง
create or replace function public.join_room(p_code text, p_name text, p_exam_code text, p_token text)
returns jsonb
language plpgsql
as $$
declare
  r public.rooms;
  a public.attempts;
  n int;
begin
  select * into r from public.rooms where code = p_code for update;
  if not found then
    return jsonb_build_object('error', 'room_not_found');
  end if;
  if r.status = 'ended' then
    return jsonb_build_object('error', 'room_ended');
  end if;
  select coalesce(max(seat_no), 0) + 1 into n from public.attempts where room_id = r.id;
  insert into public.attempts (room_id, name, seat_no, exam_code, token, status, duration_sec, started_at, deadline)
  values (
    r.id, p_name, n, p_exam_code, p_token,
    case when r.status = 'running' then 'running' else 'waiting' end,
    r.duration_sec,
    r.started_at,
    case when r.status = 'running' then r.started_at + make_interval(secs => r.duration_sec) end
  )
  returning * into a;
  return jsonb_build_object(
    'id', a.id, 'examCode', a.exam_code, 'seatNo', a.seat_no, 'status', a.status,
    'name', a.name, 'teacherChannel', r.teacher_channel
  );
end;
$$;

-- สถานะของผู้สอบ + คำตอบที่บันทึกไว้ (ใช้ตอนเปิดหน้า/รีเฟรช/ได้สัญญาณเริ่ม)
create or replace function public.get_attempt(p_attempt uuid, p_token text)
returns jsonb
language plpgsql
as $$
declare
  a public.attempts;
  r public.rooms;
begin
  select * into a from public.attempts where id = p_attempt;
  if not found or a.token <> p_token then
    return jsonb_build_object('error', 'not_found');
  end if;
  if a.status = 'running' and now() > a.deadline + interval '20 seconds' then
    a := public._finalize_attempt(a.id);
  end if;
  if a.room_id is not null then
    select * into r from public.rooms where id = a.room_id;
  end if;
  return jsonb_build_object(
    'id', a.id, 'name', a.name, 'examCode', a.exam_code, 'seatNo', a.seat_no,
    'status', a.status, 'durationSec', a.duration_sec,
    'startedAt', a.started_at, 'deadline', a.deadline, 'submittedAt', a.submitted_at,
    'score', a.score, 'answered', a.answered, 'usedSec', a.used_sec,
    'room', case when r.id is null then null else jsonb_build_object(
      'code', r.code, 'title', r.title, 'status', r.status, 'startedAt', r.started_at
    ) end,
    'answers', coalesce((
      select jsonb_object_agg(q::text, choice) from public.answers where attempt_id = a.id and choice is not null
    ), '{}'::jsonb),
    'serverNow', now()
  );
end;
$$;

-- บันทึกคำตอบ (รับหลายข้อในครั้งเดียว) choice = null หมายถึงล้างคำตอบข้อนั้น
-- ความถูกต้อง (correct) ตรวจที่ server ของ Next.js ซึ่งถือเฉลยไว้
create or replace function public.save_answers(p_attempt uuid, p_token text, p_items jsonb)
returns jsonb
language plpgsql
as $$
declare
  a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt for update;
  if not found or a.token <> p_token then
    return jsonb_build_object('error', 'not_found');
  end if;
  if a.status <> 'running' then
    return jsonb_build_object('error', 'not_running', 'status', a.status);
  end if;
  if now() > a.deadline + interval '20 seconds' then
    perform public._finalize_attempt(a.id);
    return jsonb_build_object('error', 'time_up');
  end if;

  insert into public.answers (attempt_id, q, choice, correct, updated_at)
  select p_attempt, (x ->> 'q')::smallint, (x ->> 'choice')::smallint, coalesce((x ->> 'correct')::boolean, false), now()
  from jsonb_array_elements(p_items) x
  on conflict (attempt_id, q) do update
    set choice = excluded.choice, correct = excluded.correct, updated_at = excluded.updated_at;

  update public.attempts
  set score = (select count(*) filter (where correct) from public.answers where attempt_id = p_attempt),
      answered = (select count(*) from public.answers where attempt_id = p_attempt and choice is not null)
  where id = p_attempt
  returning * into a;

  return jsonb_build_object(
    'score', a.score, 'answered', a.answered, 'serverNow', now(),
    'teacherChannel', (select teacher_channel from public.rooms where id = a.room_id)
  );
end;
$$;

-- ส่งข้อสอบ (เรียกซ้ำได้)
create or replace function public.submit_attempt(p_attempt uuid, p_token text)
returns jsonb
language plpgsql
as $$
declare
  a public.attempts;
begin
  select * into a from public.attempts where id = p_attempt for update;
  if not found or a.token <> p_token then
    return jsonb_build_object('error', 'not_found');
  end if;
  if a.status = 'running' then
    a := public._finalize_attempt(a.id);
  end if;
  return jsonb_build_object(
    'id', a.id, 'status', a.status, 'score', a.score, 'answered', a.answered,
    'usedSec', a.used_sec, 'name', a.name, 'seatNo', a.seat_no,
    'teacherChannel', (select teacher_channel from public.rooms where id = a.room_id)
  );
end;
$$;

-- ครูกดเริ่มสอบ: ทุกคนในห้องเริ่มพร้อมกันด้วยเวลาเดียวกัน
create or replace function public.start_room(p_code text, p_token text)
returns jsonb
language plpgsql
as $$
declare
  r public.rooms;
begin
  select * into r from public.rooms where code = p_code for update;
  if not found or r.teacher_token <> p_token then
    return jsonb_build_object('error', 'forbidden');
  end if;
  if r.status = 'waiting' then
    update public.rooms set status = 'running', started_at = now() where id = r.id returning * into r;
    update public.attempts
    set status = 'running', started_at = r.started_at,
        deadline = r.started_at + make_interval(secs => r.duration_sec)
    where room_id = r.id and status = 'waiting';
  end if;
  return jsonb_build_object(
    'status', r.status, 'startedAt', r.started_at,
    'deadline', r.started_at + make_interval(secs => r.duration_sec), 'serverNow', now()
  );
end;
$$;

-- ครูกดจบการสอบ: ปิดห้องและเก็บกระดาษคำตอบของทุกคนที่ยังไม่ส่ง
create or replace function public.end_room(p_code text, p_token text)
returns jsonb
language plpgsql
as $$
declare
  r public.rooms;
  submitted jsonb;
begin
  select * into r from public.rooms where code = p_code for update;
  if not found or r.teacher_token <> p_token then
    return jsonb_build_object('error', 'forbidden');
  end if;
  update public.rooms set status = 'ended', ended_at = coalesce(ended_at, now()) where id = r.id;
  with fin as (
    update public.attempts
    set status = 'submitted',
        submitted_at = now(),
        used_sec = case when started_at is null then 0
                   else least(duration_sec, greatest(0, extract(epoch from (now() - started_at))::int)) end
    where room_id = r.id and status in ('running', 'waiting')
    returning id, score, answered, used_sec
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', id, 'score', score, 'answered', answered, 'usedSec', used_sec)), '[]'::jsonb)
  into submitted from fin;
  return jsonb_build_object('status', 'ended', 'submitted', submitted);
end;
$$;

-- ข้อมูลทั้งหมดสำหรับหน้าครูคุมสอบ ในการเรียกครั้งเดียว
create or replace function public.proctor_snapshot(p_code text, p_token text)
returns jsonb
language plpgsql
as $$
declare
  r public.rooms;
begin
  select * into r from public.rooms where code = p_code;
  if not found or r.teacher_token <> p_token then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object(
    'room', jsonb_build_object(
      'code', r.code, 'title', r.title, 'status', r.status, 'durationSec', r.duration_sec,
      'startedAt', r.started_at, 'endedAt', r.ended_at, 'teacherChannel', r.teacher_channel
    ),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'seatNo', a.seat_no, 'examCode', a.exam_code,
        'status', a.status, 'score', a.score, 'answered', a.answered, 'usedSec', a.used_sec
      ) order by a.seat_no)
      from public.attempts a where a.room_id = r.id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_array(x.attempt_id, x.q, x.choice, x.correct))
      from public.answers x join public.attempts a on a.id = x.attempt_id
      where a.room_id = r.id and x.choice is not null
    ), '[]'::jsonb),
    'serverNow', now()
  );
end;
$$;

-- เฉพาะสิ่งที่เปลี่ยนตั้งแต่ p_since: หน้าครูเรียกทุก 2 วินาที เป็นทางสำรองที่รับประกันว่าข้อมูลไม่หาย
-- แม้ข้อความ realtime จะหลุดหรือโดนจำกัดจำนวน (ข้อมูลเล็กมาก เพราะส่งเฉพาะแถวที่เปลี่ยน)
create or replace function public.proctor_changes(p_code text, p_token text, p_since timestamptz)
returns jsonb
language plpgsql
stable
as $$
declare
  r public.rooms;
begin
  select * into r from public.rooms where code = p_code;
  if not found or r.teacher_token <> p_token then
    return jsonb_build_object('error', 'forbidden');
  end if;
  return jsonb_build_object(
    'room', jsonb_build_object('status', r.status, 'startedAt', r.started_at, 'endedAt', r.ended_at),
    'attempts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'seatNo', a.seat_no, 'examCode', a.exam_code,
        'status', a.status, 'score', a.score, 'answered', a.answered, 'usedSec', a.used_sec
      ))
      from public.attempts a where a.room_id = r.id and a.updated_at >= p_since
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(jsonb_build_array(x.attempt_id, x.q, x.choice, x.correct))
      from public.answers x join public.attempts a on a.id = x.attempt_id
      where a.room_id = r.id and x.updated_at >= p_since
    ), '[]'::jsonb),
    'serverNow', now()
  );
end;
$$;

-- อันดับคะแนน: p_code = null คือกระดานสอบเดี่ยว
create or replace function public.leaderboard(p_code text, p_limit int default 20)
returns jsonb
language sql
stable
as $$
  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
  from (
    select a.id, a.name, a.score, a.answered, a.used_sec as "usedSec", a.submitted_at as "submittedAt", a.seat_no as "seatNo"
    from public.attempts a
    where a.status = 'submitted'
      and (
        (p_code is null and a.room_id is null)
        or a.room_id = (select id from public.rooms where code = p_code)
      )
    order by a.score desc, a.used_sec asc nulls last, a.submitted_at asc
    limit p_limit
  ) t;
$$;

-- ให้เรียกฟังก์ชันได้เฉพาะ service role (server) เท่านั้น
do $$
declare
  f text;
begin
  foreach f in array array[
    '_finalize_attempt(uuid)',
    'create_solo_attempt(text, text, text, int)',
    'join_room(text, text, text, text)',
    'get_attempt(uuid, text)',
    'save_answers(uuid, text, jsonb)',
    'submit_attempt(uuid, text)',
    'start_room(text, text)',
    'end_room(text, text)',
    'proctor_snapshot(text, text)',
    'proctor_changes(text, text, timestamptz)',
    'leaderboard(text, int)'
  ] loop
    execute format('revoke all on function public.%s from public, anon, authenticated', f);
    execute format('grant execute on function public.%s to service_role', f);
  end loop;
end;
$$;
