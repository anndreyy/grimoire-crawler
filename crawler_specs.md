# Especificações do Projeto Grimoire (Para Crawler)

Este documento detalha a estrutura de dados e os requisitos técnicos para popular o banco de dados do **Grimoire** via scripts externos (crawlers/scrapers).

## 1. Banco de Dados (Supabase)

O projeto utiliza **Supabase** (PostgreSQL). O crawler deve conectar-se via **Supabase JavaScript Client** ou **Postgres Connection String**.

### Tabela: `novels`
Armazena os metadados das obras.

| Coluna | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `text` | **Sim** | Identificador único (CUID). *Não é auto-incremento.* |
| `title` | `text` | **Sim** | Título da obra. |
| `author` | `text` | **Sim** | Nome do autor(a). |
| `description` | `text` | Não | Sinopse/Descrição da obra. |
| `cover_url` | `text` | Não | URL da imagem de capa. |
| `source_url` | `text` | Não | URL de origem. |
| `language` | `varchar(10)` | Não | Padrão: 'pt-BR'. |
| `status` | `text` | Não | Padrão: 'PUBLISHED'. |
| `slug` | `text` | Não | Identificador amigável para URL. |
| `category` | `text` | Não | Categoria da obra. |
| `created_at` | `timestamptz` | Não | Default: `now()`. |
| `updated_at` | `timestamptz` | Não | Default: `now()`. |

### Tabela: `chapters`
Armazena o conteúdo textual dos capítulos.

| Coluna | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `text` | **Sim** | Identificador único (CUID). |
| `novel_id` | `text` | **Sim** | ID da novela pai (FK). |
| `chapter_number` | `integer` | **Sim** | Número sequencial do capítulo. Usado para ordenação. |
| `title` | `text` | **Sim** | Título do capítulo (Ex: "Episode 1"). |
| `content` | `text` | **Sim** | Conteúdo em HTML sanitizado. |
| `created_at` | `timestamptz` | Não | Default: `now()`. |
| `updated_at` | `timestamptz` | Não | Default: `now()`. |

### Tabela: `novel_glossaries`
Armazena termos específicos para tradução consistente.

| Coluna | Tipo | Obrigatório? | Descrição |
| :--- | :--- | :--- | :--- |
| `id` | `text` | **Sim** | Identificador único (CUID). |
| `novel_id` | `text` | **Sim** | ID da novela pai (FK). |
| `original_term` | `text` | **Sim** | Termo original. |
| `translated_term` | `text` | **Sim** | Termo traduzido. |
| `context` | `text` | Não | Contexto de uso. |
| `created_at` | `timestamptz` | Não | Default: `now()`. |

---

## 2. Requisitos de Dados

### IDs (CUID)
O sistema não usa UUID v4 nem Integers. Utiliza **CUIDs** (Collision Resistant Unique Identifiers).
- **Formato**: String de ~24 caracteres (ex: `clq3a1b2c...`).
- **Crawler**: Seu crawler **deve gerar** os IDs antes de inserir.
- **Lib Recomendada (Node.js)**: `@paralleldrive/cuid2`
  ```bash
  npm install @paralleldrive/cuid2
  ```
  ```javascript
  import { createId } from '@paralleldrive/cuid2';
  const newId = createId();
  ```

### Conteúdo (HTML)
O campo `content` espera HTML **limpo**.
- **Tags permitidas**: `<p>`, `<b>`, `<i>`, `<strong>`, `<em>`, `<br>`.
- **Estrutura**: O texto deve estar envolto em tags de parágrafo `<p>`.
  - **Correto**: `<p>Hello world.</p><p>This is a story.</p>`
  - **Evitar**: Texto puro com `\n` (quebras de linha podem não renderizar bem sem CSS específico).

---

## 3. Exemplo de Inserção (Node.js + Supabase SDK)

```javascript
import { createClient } from '@supabase/supabase-js';
import { createId } from '@paralleldrive/cuid2';

// 1. Configurar Cliente
const supabase = createClient('SUA_URL', 'SUA_CHAVE_SERVICE_ROLE');

async function saveNovelWithChapters(scrapedData) {
  
  // 2. Gerar ID e Inserir Novela
  const novelId = createId();
  
  const { error: novelError } = await supabase
    .from('novels')
    .insert({
      id: novelId,
      title: scrapedData.title,
      author: scrapedData.author,
      description: scrapedData.description,
      cover_url: scrapedData.coverImage
    });

  if (novelError) throw novelError;

  // 3. Preparar Capítulos
  const chaptersToInsert = scrapedData.chapters.map((chap, index) => ({
    id: createId(),
    novel_id: novelId,
    chapter_number: index + 1, // Ou chap.number
    title: chap.title,
    content: chap.htmlContent
  }));

  // 4. Inserir Capítulos (Batch)
  const { error: chapError } = await supabase
    .from('chapters')
    .insert(chaptersToInsert);

  if (chapError) throw chapError;
  
  console.log(`Salvo: ${scrapedData.title} com ${chaptersToInsert.length} capítulos.`);
}
```
