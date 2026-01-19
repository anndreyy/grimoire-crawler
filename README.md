# Grimoire Crawler

Este projeto é um crawler (web scraper) desenvolvido em Node.js para popular o banco de dados do **Grimoire** (Supabase/PostgreSQL) com Web Novels.

## Funcionalidades

- **Extração de Metadados**: Título, Autor, Descrição e Capa.
- **Extração de Capítulos**: Título e Conteúdo HTML.
- **Sanitização**: O conteúdo é salvo estritamente com tags `<p>`, `<b>`, `<i>`, `<strong>`, `<em>`, `<br>`.
- **Banco de Dados**: Gera IDs seguros (CUID) e salva automaticamente no Supabase.
- **Resiliência**: Tenta retomar de onde parou e atualiza dados existentes.

## Pré-requisitos

- Node.js (v18 ou superior recomendado)
- Conta no Supabase e banco de dados configurado.

## Instalação

1. Clone o repositório ou baixe os arquivos.
2. Instale as dependências:
   ```bash
   npm install
   ```

## Configuração

1. Crie um arquivo `.env` na raiz do projeto (copie de `.env.example` se existir) e adicione suas credenciais do Supabase:

   ```env
   SUPABASE_URL="Sua URL do Supabase"
   SUPABASE_KEY="Sua Chave Service Role (ou Anon se tiver policies permitindo escrita)"
   ```

2. **Configuração do Banco de Dados**:
   Execute o script SQL fornecido (`setup_database.sql`) no Editor SQL do seu painel Supabase para criar as tabelas `novels` e `chapters` com a estrutura correta.

   > **Atenção**: Se você já tinha tabelas criadas anteriormente com IDs do tipo UUID, será necessário recriá-las ou migrar os dados, pois este crawler utiliza IDs do tipo **Text (CUID)**.

3. **Ajuste de Seletores**:
   Abra o arquivo `crawler.js` e edite o objeto `CONFIG.selectors` para corresponder à estrutura HTML do site que você deseja extrair:

   ```javascript
   const CONFIG = {
       selectors: {
           title: 'h1',           // Título da Novel
           author: '.author',     // Seletor do Autor
           description: '.desc',  // Seletor da Sinopse
           cover: 'img.cover',    // Imagem de Capa
           chapterList: '.list a',// Links dos capítulos
           chapterContent: '#content' // Área do texto do capítulo
           // ...
       }
       // ...
   };
   ```

## Uso

### Modo Interativo
Execute sem argumentos e o script pedirá a URL:
```bash
npm start
```

### Modo Direto
Passe a URL da página principal da novel (índice) como argumento:
```bash
node crawler.js "https://exemplo.com/novela-x"
```

## Estrutura do Banco de Dados

- **Novels**: `id` (CUID), `title`, `author`, `description`, `cover_url`, `source_url`, `status`, `language`, `category`, `slug`.
- **Chapters**: `id` (CUID), `novel_id`, `title`, `chapter_number`, `content` (HTML Sanitizado), `source_url`.
- **Glossários**: `id` (CUID), `novel_id`, `original_term`, `translated_term`, `context`.

## Dependências Principais

- `axios`: Requisições HTTP.
- `cheerio`: Manipulação de HTML (estilo jQuery).
- `@supabase/supabase-js`: Cliente do Banco de Dados.
- `@paralleldrive/cuid2`: Geração de IDs únicos seguros.

---
Desenvolvido para o projeto Grimoire.
