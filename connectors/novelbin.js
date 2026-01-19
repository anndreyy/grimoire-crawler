/**
 * Conector para NovelBin (novelbin.me)
 */
export const novelbin = {
    name: 'NovelBin',

    // Verifica se a URL pertence a este conector
    check: (url) => url.includes('novelbin.me'),

    // Requisitos específicos de requisição
    config: {
        delayBetweenChapters: 2000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://novelbin.me/',
        }
    },

    // Seletores CSS
    selectors: {
        title: 'h3.title',
        // Author/Genre/Status são extraídos via lógica no extractMetadata para maior robustez
        cover: '.book img',
        // Chapter List Selector (Updated for Generic/AJAX)
        chapterList: '.list-chapter li a, .panel-body li a',
        chapterTitle: '.chr-title', // Titulo dentro do capitulo
        chapterContent: '#chr-content',
    },

    /**
     * Extrai metadados da página da Novel
     */
    extractMetadata: ($, currentUrl) => {
        const title = $('h3.title').first().text().trim() || 'Título Desconhecido';

        let author = 'Autor Desconhecido';
        let category = 'Gênero Desconhecido';
        let status = 'Desconhecido';
        const language = 'en'; // NovelBin é majoritariamente Inglês

        // Itera sobre a lista de meta info para achar os campos
        $('.info-meta li').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('Author:')) {
                author = $(el).find('a').text().trim() || text.replace('Author:', '').trim();
            } else if (text.includes('Genre:')) {
                category = $(el).find('a').first().text().trim() || text.replace('Genre:', '').trim();
            } else if (text.includes('Status:')) {
                status = $(el).find('a').text().trim() || text.replace('Status:', '').trim();
            }
        });

        const description = $('.desc-text').text().trim() || $('#tab-description').text().trim() || '';

        let coverUrl = $('.book img').attr('src') || null;
        if (coverUrl && !coverUrl.startsWith('http')) {
            coverUrl = new URL(coverUrl, currentUrl).href;
        }

        // Slug generation fallback is handled by main crawler if not returned here
        // But we can extract it from URL
        // https://novelbin.me/novel-book/cultivation-chat-group -> cultivation-chat-group
        let slug = null;
        const match = currentUrl.match(/novel-book\/([^/?#]+)/);
        if (match) slug = match[1];

        return { title, author, description, coverUrl, status, category, language, slug };
    },

    /**
     * Gera lista de URLs para crawling baseado em intervalo (Range Mode)
     * NovelBin segue padrão: https://novelbin.me/novel-book/{slug}/chapter-{number}
     */
    /**
     * Gera lista de URLs para crawling baseado em intervalo (Range Mode)
     * NovelBin segue padrão: https://novelbin.me/novel-book/{slug}/chapter-{number}
     * DESATIVADO: Preferimos usar a lista completa AJAX + Filtro no crawler.js
     */
    /*
    generateChapterUrls: (novelUrl, start, end) => {
        let slug = null;
        const match = novelUrl.match(/novel-book\/([^/?#]+)/);
        if (match) slug = match[1];

        if (!slug) return [];

        const links = [];
        for (let i = start; i <= end; i++) {
            const link = `https://novelbin.me/novel-book/${slug}/chapter-${i}`;
            links.push({
                link,
                title: `Chapter ${i}`,
                number: i
            });
        }
        return links;
    },
    */

    /**
     * Retorna a URL da lista completa de capítulos (AJAX)
     */
    getChapterListUrl: (novelUrl) => {
        let slug = null;
        const match = novelUrl.match(/novel-book\/([^/?#]+)/);
        if (match) slug = match[1];

        return slug ? `https://novelbin.me/ajax/chapter-archive?novelId=${slug}` : null;
    },

    /**
     * Extrai links da página (Scraping Mode)
     */
    extractChapterLinks: ($, novelUrl) => {
        const links = [];

        // Suporta tanto a estrutura da página principal quanto a do AJAX
        const selectors = ['.list-chapter li a', '.panel-body li a', 'ul.list-chapter li a'];
        let foundElements = [];

        for (const sel of selectors) {
            const els = $(sel);
            if (els.length > 0) {
                foundElements = els;
                break;
            }
        }

        foundElements.each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            const absoluteLink = link.startsWith('http') ? link : new URL(link, 'https://novelbin.me').href;

            // Tenta extrair numero
            // "Chapter 1: Title"
            let number = i + 1;
            const numMatch = title.match(/Chapter\s+(\d+)/i);
            if (numMatch) {
                number = parseInt(numMatch[1]);
            }

            links.push({
                link: absoluteLink,
                title,
                number
            });
        });

        // Garante ordem correta (Menor para Maior) se a lista estiver invertida
        // Se links[0] > links[last], inverte.
        if (links.length > 1) {
            const first = links[0].number;
            const last = links[links.length - 1].number;
            if (first > last) {
                links.reverse();
            }
        }

        return links;
    },

    /**
     * Limpeza específica
     */
    cleanContent: ($) => {
        const $content = $('#chr-content');

        // Remove ads e scripts
        $content.find('script, .ads, .google-auto-placed, div[align="center"]').remove();

        // Remove texto de "prev/next" se houver dentro do content
        $content.find('#chr-nav-top, #chr-nav-bottom').remove();
    }
};
