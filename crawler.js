import axios from 'axios';
import * as cheerio from 'cheerio';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

/**
 * CONFIGURAÇÃO DO CRAWLER
 * Ajuste os seletores CSS abaixo conforme o site alvo.
 */
const CONFIG = {
    // URL inicial será passada via argumento ou prompt
    selectors: {
        title: 'h1', // Seletor do título da novel na página principal
        cover: 'img.cover', // Seletor da imagem de capa (tente ser específico)
        chapterList: '.chapter-list a', // Seletor dos links dos capítulos na lista
        chapterTitle: '.chapter-title', // Seletor do título na página do capítulo
        chapterContent: '#chapter-content', // Container do texto do capítulo
    },
    // Configurações de requisição
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    },
    delayBetweenChapters: 1500, // Delay em ms para evitar bloqueios
};

// Verifica variáveis de ambiente
if (!process.env.SUPABASE_URL || !process.env.SUPABASE_KEY) {
    console.error('\x1b[31m%s\x1b[0m', 'ERRO: SUPABASE_URL e SUPABASE_KEY são obrigatórios no arquivo .env');
    process.exit(1);
}

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

// Helpers de Log Colorido
const log = {
    info: (msg) => console.log(`\x1b[36m[INFO]\x1b[0m ${msg}`),
    success: (msg) => console.log(`\x1b[32m[SUCCESS]\x1b[0m ${msg}`),
    warn: (msg) => console.log(`\x1b[33m[WARN]\x1b[0m ${msg}`),
    error: (msg) => console.error(`\x1b[31m[ERROR]\x1b[0m ${msg}`),
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchPage(url) {
    try {
        const { data } = await axios.get(url, { headers: CONFIG.headers });
        return cheerio.load(data);
    } catch (error) {
        throw new Error(`Falha ao acessar ${url}: ${error.message}`);
    }
}

/**
 * Sanitiza o conteúdo HTML mantendo apenas tags de texto permitidas.
 */
function sanitizeContent($) {
    const $content = $(CONFIG.selectors.chapterContent);

    // Remove elementos indesejados
    $content.find('script, style, iframe, form, .ads, .comment-section').remove();
    
    // Opcional: Remover atributos inseguros ou desnecessários
    $content.find('*').each((i, el) => {
        const attribs = el.attribs;
        for (const attr in attribs) {
            // Mantém apenas src e href, remove on*, style, class, etc.
            if (!['src', 'href'].includes(attr)) {
                $(el).removeAttr(attr);
            }
        }
    });

    // Retorna HTML limpo. Trim para remover espaços extras.
    return $content.html()?.trim() || '';
}

async function processNovel(novelUrl) {
    log.info(`Iniciando processamento da Novel: ${novelUrl}`);

    try {
        const $ = await fetchPage(novelUrl);

        // 1. Extrair Dados da Novel
        const title = $(CONFIG.selectors.title).first().text().trim() || 'Título Desconhecido';
        const coverUrl = $(CONFIG.selectors.cover).attr('src') || null;

        if (!title) {
            throw new Error('Não foi possível extrair o título da Novel. Verifique o seletor.');
        }

        // Corrige URL da capa se for relativa
        const absoluteCoverUrl = coverUrl && !coverUrl.startsWith('http') 
            ? new URL(coverUrl, novelUrl).href 
            : coverUrl;

        log.info(`Novel encontrada: ${title}`);
        log.info(`Capa: ${absoluteCoverUrl}`);

        // 2. Salvar Novel no Supabase
        const { data: novelData, error: novelError } = await supabase
            .from('novels')
            .upsert({ 
                title, 
                cover_url: absoluteCoverUrl, 
                source_url: novelUrl 
            }, { onConflict: 'source_url' })
            .select()
            .single();

        if (novelError) throw new Error(`Erro ao salvar novel: ${novelError.message}`);
        
        const novelId = novelData.id;
        log.success(`Novel salva/atualizada com ID: ${novelId}`);

        // 3. Extrair Lista de Capítulos
        const chapterLinks = [];
        $(CONFIG.selectors.chapterList).each((i, el) => {
            const link = $(el).attr('href');
            // Tenta pegar o título do link ou texto
            const chapTitle = $(el).text().trim(); 
            if (link) {
                chapterLinks.push({ link, title: chapTitle });
            }
        });

        // Inverte a ordem se necessário (muitos sites listam do mais novo para o antigo)
        // Assumindo ordem da página. Se precisar inverter: chapterLinks.reverse();
        // Vou assumir que o crawler deve pegar na ordem que aparece, mas geralmente crawlers pegam
        // a lista completa. Alguns sites tem "Show All" que precisa ser clicado, mas isso é JS-only.
        // Focaremos na lista estática presente.
        
        log.info(`Encontrados ${chapterLinks.length} capítulos.`);

        // 4. Processar Capítulos
        for (let i = 0; i < chapterLinks.length; i++) {
            const { link, title: linkTitle } = chapterLinks[i];
            const absoluteLink = link.startsWith('http') ? link : new URL(link, novelUrl).href;
            const chapterNum = i + 1; // Ordem sequencial baseada na lista

            log.info(`Processando capítulo ${chapterNum}/${chapterLinks.length}: ${linkTitle || absoluteLink}`);

            try {
                // Verifica se já existe para pular (Opcional, mas bom para resume)
                // O upsert lida com isso, mas evitar request HTTP economiza tempo.
                // Vou fazer o request sempre para garantir atualização de conteúdo se falhou antes.
                
                await sleep(CONFIG.delayBetweenChapters);
                
                const $chap = await fetchPage(absoluteLink);
                
                // Extrai Título Real da página do capítulo (mais preciso que o link)
                const realTitle = $chap(CONFIG.selectors.chapterTitle).text().trim() || linkTitle || `Capítulo ${chapterNum}`;
                const content = sanitizeContent($chap);

                if (!content || content.length < 50) {
                    log.warn(`Conteúdo muito curto ou vazio para: ${realTitle}. Verifique seletores.`);
                }

                // Salva Capítulo
                const { error: chapError } = await supabase
                    .from('chapters')
                    .upsert({
                        novel_id: novelId,
                        title: realTitle,
                        chapter_number: chapterNum,
                        content: content,
                        source_url: absoluteLink
                    }, { onConflict: 'novel_id, chapter_number' }); // Requer Unique Constraint criada no SQL

                if (chapError) {
                    log.error(`Erro ao salvar capítulo ${chapterNum}: ${chapError.message}`);
                } else {
                    log.success(`Capítulo ${chapterNum} salvo com sucesso.`);
                }

            } catch (err) {
                log.error(`Falha no capítulo ${chapterNum} (${absoluteLink}): ${err.message}`);
                // Continua para o próximo
            }
        }

        log.success('Processamento finalizado!');

    } catch (error) {
        log.error(`Erro Critico: ${error.message}`);
    }
}

// Entry Point
const urlArg = process.argv[2];

if (urlArg) {
    processNovel(urlArg);
} else {
    // Modo interativo se não passar argumento
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    rl.question('Digite a URL da Novel (Table of Contents): ', (url) => {
        rl.close();
        if (url) processNovel(url.trim());
        else console.log('URL inválida.');
    });
}
