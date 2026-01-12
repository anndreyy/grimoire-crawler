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
