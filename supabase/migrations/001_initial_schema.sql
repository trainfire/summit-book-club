create extension if not exists pgcrypto;

create table public.members (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  current_reading text,
  created_at timestamptz not null default now()
);

create table public.books (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  year integer,
  pages integer check (pages is null or pages >= 0),
  genre text,
  progress_percent integer default 0 check (progress_percent between 0 and 100),
  suggested_by text,
  meeting_date date,
  meeting_location text,
  library_copies text,
  cocktail_name text,
  cocktail_recipe text,
  cocktail_paired_by text,
  goodreads_url text,
  libby_url text,
  library_url text,
  is_current boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index one_current_book on public.books (is_current) where is_current = true;

create table public.nominations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  year integer,
  pages integer check (pages is null or pages >= 0),
  genre text,
  description text,
  library_wait text,
  has_audio boolean not null default false,
  has_paperback boolean not null default false,
  has_adaptation boolean not null default false,
  suggested_by_member_id uuid references public.members(id) on delete set null,
  suggested_by_name text,
  created_at timestamptz not null default now()
);

create table public.votes (
  id uuid primary key default gen_random_uuid(),
  nomination_id uuid not null references public.nominations(id) on delete cascade,
  member_id uuid not null references public.members(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (nomination_id, member_id)
);

create table public.quotes (
  id uuid primary key default gen_random_uuid(),
  quote_text text not null,
  book_title text not null,
  book_author text,
  submitted_by_member_id uuid references public.members(id) on delete set null,
  submitted_by_name text,
  created_at timestamptz not null default now()
);

create table public.reading_history (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  author text not null,
  suggested_by text,
  read_date date,
  rating numeric(2,1) check (rating is null or rating between 0 and 5),
  group_note text,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger books_set_updated_at
before update on public.books
for each row execute function public.set_updated_at();

alter table public.members enable row level security;
alter table public.books enable row level security;
alter table public.nominations enable row level security;
alter table public.votes enable row level security;
alter table public.quotes enable row level security;
alter table public.reading_history enable row level security;

create policy "Open club access to members"
on public.members for all
to anon
using (true)
with check (true);

create policy "Open club access to books"
on public.books for all
to anon
using (true)
with check (true);

create policy "Open club access to nominations"
on public.nominations for all
to anon
using (true)
with check (true);

create policy "Open club access to votes"
on public.votes for all
to anon
using (true)
with check (true);

create policy "Open club access to quotes"
on public.quotes for all
to anon
using (true)
with check (true);

create policy "Open club access to reading history"
on public.reading_history for all
to anon
using (true)
with check (true);

insert into public.members (name, current_reading)
values
  ('Corey', null),
  ('Alex', null),
  ('Sam', null)
on conflict (name) do nothing;

insert into public.books (
  title,
  author,
  year,
  pages,
  genre,
  progress_percent,
  suggested_by,
  meeting_date,
  meeting_location,
  library_copies,
  cocktail_name,
  cocktail_recipe,
  cocktail_paired_by,
  is_current
)
values (
  'Set the First Book',
  'Summit Book Club',
  2026,
  null,
  'Book Club',
  0,
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  true
)
on conflict do nothing;
