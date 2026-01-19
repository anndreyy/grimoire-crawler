-- Tabela de Fila de Execução do Crawler
CREATE TYPE job_status AS ENUM ('pending', 'processing', 'completed', 'failed');

CREATE TABLE crawler_queue (
    id TEXT NOT NULL PRIMARY KEY, -- CUID
    target_url TEXT NOT NULL,
    start_chapter INT,
    end_chapter INT,
    status job_status DEFAULT 'pending',
    error_message TEXT,
    requested_by UUID REFERENCES profiles(id), -- Referencia tabela profiles (UUID)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Indice para buscar jobs pendentes mais rápido
CREATE INDEX idx_crawler_queue_status_created_at ON crawler_queue(status, created_at);

-- Tabela de Novels
create table public.novels (
  id text not null,
  title text not null,
  author text not null,
  description text null,
  cover_url text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  source_url text null,
  language character varying(10) null default 'pt-BR'::character varying,
  status text null default 'PUBLISHED'::text,
  slug text null,
  category text null,
  constraint novels_pkey primary key (id),
  constraint novels_slug_key unique (slug),
  constraint novels_source_url_key unique (source_url)
) TABLESPACE pg_default;

-- Tabela de Capítulos
create table public.chapters (
  id text not null,
  novel_id text not null,
  chapter_number integer not null,
  title text not null,
  content text not null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  updated_at timestamp with time zone not null default timezone ('utc'::text, now()),
  source_url text null,
  constraint chapters_pkey primary key (id),
  constraint unique_chapter_per_novel unique (novel_id, chapter_number),
  constraint chapters_novel_id_fkey foreign KEY (novel_id) references novels (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists chapters_novel_id_idx on public.chapters using btree (novel_id) TABLESPACE pg_default;
create index IF not exists chapters_novel_id_chapter_number_idx on public.chapters using btree (novel_id, chapter_number) TABLESPACE pg_default;

-- Tabela de Glossários
create table public.novel_glossaries (
  id text not null,
  novel_id text not null,
  original_term text not null,
  translated_term text not null,
  context text null,
  created_at timestamp with time zone not null default timezone ('utc'::text, now()),
  constraint novel_glossaries_pkey primary key (id),
  constraint novel_glossaries_novel_id_fkey foreign KEY (novel_id) references novels (id) on delete CASCADE
) TABLESPACE pg_default;
