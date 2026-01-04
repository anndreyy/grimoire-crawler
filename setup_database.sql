-- Enable UUID extension if not enabled
create extension if not exists "uuid-ossp";

-- 1. Table: novels
create table if not exists novels (
  id uuid primary key default uuid_generate_v4(),
  title text not null,
  cover_url text,
  source_url text unique not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Table: chapters
create table if not exists chapters (
  id uuid primary key default uuid_generate_v4(),
  novel_id uuid not null references novels(id) on delete cascade,
  title text not null,
  chapter_number int,
  content text,
  source_url text not null,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique (novel_id, chapter_number) -- Optional: prevent duplicate chapters by number for the same novel
);

-- Add indexes for performance
create index if not exists idx_chapters_novel_id on chapters(novel_id);
create index if not exists idx_novels_source_url on novels(source_url);
