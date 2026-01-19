import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import { createId } from '@paralleldrive/cuid2';
import dotenv from 'dotenv';
import readline from 'readline';
import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

puppeteer.use(StealthPlugin());
import fs from 'fs';
import path from 'path';

// Importa Conectores
import { fanmtl } from './connectors/fanmtl.js';
import { centralnovel } from './connectors/centralnovel.js';
import { novelbin } from './connectors/novelbin.js';

dotenv.config();

// Lista de Conectores Disponíveis
const CONNECTORS = [fanmtl, centralnovel, novelbin];

// Verifica variáveis de ambiente
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('\x1b[31m%s\x1b[0m', 'ERRO: SUPABASE_URL e SUPABASE_KEY são obrigatórios no arquivo .env');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Configuração de Log
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) fs.mkdirSync(LOG_DIR);

const LOG_FILE = path.join(LOG_DIR, `crawler_${new Date().toISOString().split('T')[0]}.log`);

function getTimestamp() {
    return new Date().toLocaleTimeString('pt-BR');
}

function writeToLogFile(level, msg) {
    const timestamp = getTimestamp();
    const cleanMsg = msg.replace(/\x1b\[[0-9;]*m/g, ''); // Remove códigos de cor se houver
    const logLine = `[${timestamp}] [${level}] ${cleanMsg}\n`;
    fs.appendFileSync(LOG_FILE, logLine);
}

// Helpers de Log Colorido
const log = {
    info: (msg) => {
        const timestamp = getTimestamp();
        console.log(`\x1b[36m[INFO] [${timestamp}]\x1b[0m ${msg}`);
        writeToLogFile('INFO', msg);
    },
    success: (msg) => {
        const timestamp = getTimestamp();
        console.log(`\x1b[32m[SUCESSO] [${timestamp}]\x1b[0m ${msg}`);
        writeToLogFile('SUCESSO', msg);
    },
    warn: (msg) => {
        const timestamp = getTimestamp();
        console.log(`\x1b[33m[AVISO] [${timestamp}]\x1b[0m ${msg}`);
        writeToLogFile('AVISO', msg);
    },
    error: (msg) => {
        const timestamp = getTimestamp();
        console.error(`\x1b[31m[ERRO] [${timestamp}]\x1b[0m ${msg}`);
        writeToLogFile('ERRO', msg);
    },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Gerenciamento do Browser
let browser;

async function initBrowser() {
    browser = await puppeteer.launch({
        headless: "new",
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
}

async function closeBrowser() {
    if (browser) await browser.close();
}

/**
 * Função genérica de fetch usando Puppeteer
 */
async function fetchPage(url, headers = {}) {
    if (!browser) await initBrowser();

    try {
        const page = await browser.newPage();
        await page.setUserAgent(headers['User-Agent'] || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

        if (headers['Accept-Language']) {
            await page.setExtraHTTPHeaders({ 'Accept-Language': headers['Accept-Language'] });
        }

        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        await sleep(3000); // Espera carregamento dinâmico/Cloudflare

        const content = await page.content();
        await page.close();

        return cheerio.load(content);
    } catch (error) {
        throw new Error(`Falha ao acessar ${url}: ${error.message}`);
    }
}

/**
 * Sanitização Genérica de HTML
 */
function sanitizeContent($, selector) {
    const $content = $(selector).first(); // Garante pegar apenas o primeiro container se houver múltiplos

    // 1. Remove elementos indesejados (scripts, estilos, anúncios)
    $content.find('script, style, iframe, form, .ads, .comment-section, .related-posts, .sharedaddy').remove();

    let sanitizedHtml = '';

    // 2. Itera sobre o conteúdo para garantir estrutura correta
    $content.contents().each((i, el) => {
        if (el.type === 'text') {
            const text = $(el).text().trim();
            if (text) sanitizedHtml += `<p>${text}</p>`;
        } else if (el.type === 'tag') {
            const tagName = el.name;

            // Tratamento específico para <br>
            if (tagName === 'br') {
                sanitizedHtml += `<br>`;
                return; // Continua para o próximo
            }

            // Se for div, span ou p, preserva o conteúdo interno (HTML)
            if (['div', 'span', 'p', 'b', 'i', 'strong', 'em'].includes(tagName)) {
                // Usa .html() para preservar tags internas (como <br>, <i>, <b>)
                const innerHtml = $(el).html();
                // Verifica se tem conteúdo
                if (innerHtml && innerHtml.trim().length > 0) {
                    // Envolve em <p> para normalizar blocos
                    sanitizedHtml += `<p>${innerHtml.trim()}</p>`;
                }
            }
        }
    });

    return sanitizedHtml;
}

/**
 * Encontra o conector correto para a URL
 */
function getConnector(url) {
    return CONNECTORS.find(c => c.check(url));
}

/**
 * Lógica Principal do Crawler
 */
async function processNovel(novelUrl, startChapter = null, endChapter = null) {
    const connector = getConnector(novelUrl);

    if (!connector) {
        log.error(`Nenhum conector encontrado para a URL: ${novelUrl}`);
        log.info('Conectores disponíveis: ' + CONNECTORS.map(c => c.name).join(', '));
        return;
    }

    log.info(`Usando conector: ${connector.name}`);
    log.info(`URL Alvo: ${novelUrl}`);

    if (startChapter && endChapter) {
        log.info(`Modo de Intervalo: Capítulos ${startChapter} a ${endChapter}`);
    }

    try {
        // 1. Fetch da Página Principal e Metadados
        const $ = await fetchPage(novelUrl, connector.config.headers);
        const metadata = connector.extractMetadata($, novelUrl);

        if (!metadata.title || metadata.title === 'Título Desconhecido') {
            log.warn('Título não encontrado ou inválido. Verifique se o site mudou.');
        }

        log.info(`Novel: ${metadata.title}`);
        log.info(`Autor: ${metadata.author}`);
        log.info(`Capa: ${metadata.coverUrl}`);

        // 2. Salvar/Atualizar Novel no Supabase
        let novelId;
        const { data: existingNovel } = await supabase
            .from('novels')
            .select('id')
            .eq('source_url', novelUrl)
            .single();

        if (existingNovel) {
            novelId = existingNovel.id;
            log.info(`Novel já existe (ID: ${novelId}). Atualizando...`);
        } else {
            novelId = createId();
            log.info(`Criando nova Novel (ID: ${novelId})...`);
        }

        const { error: novelError } = await supabase
            .from('novels')
            .upsert({
                id: novelId,
                title: metadata.title,
                author: metadata.author,
                description: metadata.description,
                cover_url: metadata.coverUrl,
                source_url: novelUrl,
                status: metadata.status || 'PUBLISHED',
                language: metadata.language || 'pt-BR',
                category: metadata.category,
                slug: metadata.slug || metadata.title.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, ''),
                updated_at: new Date().toISOString()
            }, { onConflict: 'id' });

        if (novelError) throw new Error(`Erro DB Novel: ${novelError.message}`);
        log.success(`Novel salva com sucesso!`);

        // 2.1 Salvar Glossários (se houver)
        if (metadata.glossaries && Array.isArray(metadata.glossaries) && metadata.glossaries.length > 0) {
            log.info(`Encontrados ${metadata.glossaries.length} termos de glossário.`);
            const glossariesToInsert = metadata.glossaries.map(g => ({
                id: createId(),
                novel_id: novelId,
                original_term: g.original_term,
                translated_term: g.translated_term,
                context: g.context,
                created_at: new Date().toISOString()
            }));

            const { error: glossError } = await supabase
                .from('novel_glossaries')
                .upsert(glossariesToInsert, { onConflict: 'id' }); // Consider review conflict strategy

            if (glossError) log.error(`Erro ao salvar glossários: ${glossError.message}`);
            else log.success(`Glossários salvos.`);
        }

        // 3. Preparar Capítulos
        let chapterLinks = [];

        if (startChapter) {
            // Modo Range:
            // Se tivermos start e end, e o conector diz que suporta geração, tentamos usar.
            // Mas para NovelBin (slug complexo), o 'generateChapterUrls' pode não existir ou usuário pode preferir LIST.
            // Aqui damos preferência ao modo LIST se o conector tiver getChapterListUrl.

            if (startChapter && endChapter && connector.generateChapterUrls && !connector.getChapterListUrl) {
                chapterLinks = connector.generateChapterUrls(novelUrl, startChapter, endChapter);
            } else {
                if (startChapter && !endChapter) {
                    log.info(`Modo: A partir do capítulo ${startChapter}`);
                }

                // Busca lista completa (Scraping ou AJAX)
                if (connector.getChapterListUrl) {
                    const listUrl = connector.getChapterListUrl(novelUrl);
                    log.info(`Buscando lista completa via: ${listUrl}`);
                    const $list = await fetchPage(listUrl, connector.config.headers);
                    chapterLinks = connector.extractChapterLinks($list, novelUrl);
                } else {
                    chapterLinks = connector.extractChapterLinks($, novelUrl);
                }
            }
        } else {
            // Modo Lista Completa (sem range)
            if (connector.getChapterListUrl) {
                const listUrl = connector.getChapterListUrl(novelUrl);
                log.info(`Buscando lista completa via: ${listUrl}`);
                const $list = await fetchPage(listUrl, connector.config.headers);
                chapterLinks = connector.extractChapterLinks($list, novelUrl);
            } else {
                chapterLinks = connector.extractChapterLinks($, novelUrl);
            }
        }

        log.info(`Encontrados ${chapterLinks.length} capítulos no total.`);

        // Filtra se o usuario passou range num conector que usa scraping
        if (startChapter && chapterLinks.length > 0) {
            const endFilter = endChapter || 999999; // Se não tem fim, vai até o infinito
            const labelEnd = endChapter || 'Fim';
            log.info(`Filtrando lista para intervalo: ${startChapter} - ${labelEnd}`);
            chapterLinks = chapterLinks.filter(c => c.number >= startChapter && c.number <= endFilter);
        }

        log.info(`Processando ${chapterLinks.length} capítulos...`);

        // 4. Loop de Capítulos
        for (let i = 0; i < chapterLinks.length; i++) {
            const { link, title, number } = chapterLinks[i];
            const absoluteLink = link.startsWith('http') ? link : new URL(link, novelUrl).href;
            const chapterNum = number || (i + 1);

            const percentage = ((i + 1) / chapterLinks.length * 100).toFixed(1);
            const totalLabel = endChapter || (chapterLinks.length > 0 ? chapterLinks[chapterLinks.length - 1].number : chapterLinks.length);
            log.info(`[${percentage}%] [${chapterNum}/${totalLabel}] ${title || absoluteLink}`);

            try {
                // Check DB antes de baixar
                const { data: chapExists } = await supabase
                    .from('chapters')
                    .select('id, content')
                    .eq('novel_id', novelId)
                    .eq('chapter_number', chapterNum)
                    .single();

                if (chapExists) {
                    // Se existe, verifica se o conteúdo é válido/não-vazio
                    if (chapExists.content && chapExists.content.length > 100) {
                        log.warn(`-> Já existe. Pulando.`);
                        continue;
                    }
                    log.info(`-> Existe mas está vazio/curto (len=${chapExists.content ? chapExists.content.length : 0}). Rebaixando...`);
                }

                await sleep(connector.config.delayBetweenChapters || 2000);

                const $chap = await fetchPage(absoluteLink, connector.config.headers);

                // Extração do Título do Capítulo (Seletor específico do conector ou fallback)
                const realTitle = $chap(connector.selectors.chapterTitle).text().trim() || title || `Capítulo ${chapterNum}`;

                // Executa limpeza específica do conector se houver
                if (connector.cleanContent) {
                    connector.cleanContent($chap);
                }

                // Sanitização (Usa seletor de conteúdo específico do conector)
                const content = sanitizeContent($chap, connector.selectors.chapterContent);

                if (!content || content.length < 50) {
                    log.warn(`-> Conteúdo vazio ou muito curto.`);
                }

                const chapterId = createId();
                const { error: chapError } = await supabase
                    .from('chapters')
                    .upsert({
                        id: chapterId,
                        novel_id: novelId,
                        title: realTitle,
                        chapter_number: chapterNum,
                        content: content,
                        source_url: absoluteLink,
                        updated_at: new Date().toISOString()
                    }, { onConflict: 'novel_id, chapter_number' });

                if (chapError) {
                    log.error(`-> Erro DB: ${chapError.message}`);
                } else {
                    log.success(`-> Salvo.`);
                }

            } catch (err) {
                log.error(`-> Falha: ${err.message}`);
            }
        }

    } catch (error) {
        log.error(`Erro Crítico: ${error.message}`);
        throw error; // Propaga op erro para o worker
    } finally {
        await closeBrowser();
    }
}

async function processNextJob() {
    // 1. Buscar job pendente
    const { data: jobs, error: fetchError } = await supabase
        .from('crawler_queue')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(1);

    if (fetchError) {
        log.error(`Erro ao buscar jobs: ${fetchError.message}`);
        return false;
    }

    if (!jobs || jobs.length === 0) {
        return false;
    }

    const job = jobs[0];
    log.info(`Job encontrado: ${job.id} - ${job.target_url}`);
    if (job.requested_by) log.info(`Solicitado por: ${job.requested_by}`);

    // 2. Marcar como processando
    const { error: updateError } = await supabase
        .from('crawler_queue')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', job.id);

    if (updateError) {
        log.error(`Erro ao atualizar job para processing: ${updateError.message}`);
        return false;
    }

    try {
        // 3. Executar Crawler
        await processNovel(job.target_url, job.start_chapter, job.end_chapter);

        // 4. Sucesso
        await supabase
            .from('crawler_queue')
            .update({ status: 'completed', updated_at: new Date().toISOString() })
            .eq('id', job.id);

        log.success(`Job ${job.id} concluído com sucesso.`);

    } catch (err) {
        // 5. Falha
        log.error(`Job ${job.id} falhou: ${err.message}`);
        await supabase
            .from('crawler_queue')
            .update({
                status: 'failed',
                error_message: err.message,
                updated_at: new Date().toISOString()
            })
            .eq('id', job.id);
    }

    return true; // Processou um job
}

async function startWorker() {
    log.info('Iniciando Worker de Crawler...');
    log.info('Pressione Ctrl+C para parar.');

    while (true) {
        const processed = await processNextJob();

        if (!processed) {
            // Se não processou nada (fila vazia ou erro fetch), espera
            process.stdout.write('.'); // Heartbeat visual
            await sleep(30000); // 30 segundos
        } else {
            // Se processou, espera um pouco menos para não sobrecarregar
            await sleep(5000);
        }
    }
}

// Entry Point
// Entry Point
const arg = process.argv[2];

if (arg === '--worker' || arg === 'worker') {
    startWorker();
} else if (arg) {
    // Modo CLI Clássico
    // Se for URL, assume processamento direto
    const startArg = process.argv[3];
    const endArg = process.argv[4];

    if (startArg) {
        // Se tem startArg, pode ter endArg ou não
        processNovel(arg, parseInt(startArg), endArg ? parseInt(endArg) : null).catch(() => process.exit(1));
    } else {
        processNovel(arg).catch(() => process.exit(1));
    }
} else {
    // Menu Interativo
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

    console.log('\n--- Grimoire Crawler ---');
    console.log('1. Inserir URL Manualmente');
    console.log('2. Iniciar Worker (Fila)');

    rl.question('Escolha uma opção: ', (option) => {
        if (option === '2') {
            rl.close();
            startWorker();
        } else {
            rl.question('URL da Novel: ', (url) => {
                rl.close();
                if (url) processNovel(url.trim()).catch(() => process.exit(1));
            });
        }
    });
}
