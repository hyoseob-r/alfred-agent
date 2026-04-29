-- feedback 테이블
create table if not exists feedback (
  id uuid default gen_random_uuid() primary key,
  type text not null default 'manual', -- 'crash' | 'manual'
  priority text not null default 'normal', -- 'critical' | 'high' | 'normal' | 'low'
  status text not null default 'new', -- 'new' | 'reviewing' | 'in_progress' | 'done' | 'deferred' | 'ignored'
  message text,
  stack_trace text,
  url text,
  user_agent text,
  app_version text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- feedback_comments 테이블
create table if not exists feedback_comments (
  id uuid default gen_random_uuid() primary key,
  feedback_id uuid references feedback(id) on delete cascade,
  author text not null default 'claude', -- 'claude' | 'owner'
  content text not null,
  created_at timestamptz default now()
);

-- updated_at 자동 갱신 트리거
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger feedback_updated_at
  before update on feedback
  for each row execute function update_updated_at();
