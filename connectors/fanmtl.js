/**
 * Conector para FanMTL (fanmtl.com)
 */
export const fanmtl = {
    name: 'FanMTL',

    // Verifica se a URL pertence a este conector
    check: (url) => url.includes('fanmtl.com'),

    // Requisitos específicos de requisição
    config: {
        delayBetweenChapters: 2000,
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9'
        }
    },

    // Seletores CSS
    selectors: {
        title: 'h1.novel-title',
        author: '.author',
        description: '.summary',
        cover: '.cover img',
        chapterList: '.chapter-list li a',
        chapterTitle: 'h2',
        chapterContent: '.chapter-content',
    },

    /**
     * Extrai metadados da página da Novel (Capa, Título, Autor, Descrição)
     * @param {Object} $ - Objeto Cheerio carregado da página
     * @param {String} currentUrl - URL atual da página
     */
    extractMetadata: ($, currentUrl) => {
        const title = $('h1.novel-title').first().text().trim() || 'Título Desconhecido';

        // Lógica específica para limpar string "Author: ..."
        const author = $('.author').first().text().replace('Author:', '').trim() || 'Autor Desconhecido';

        const description = $('.summary').first().text().trim() || '';

        let coverUrl = $('.cover img').attr('src') || null;
        // Corrige URL relativa
        if (coverUrl && !coverUrl.startsWith('http')) {
            coverUrl = new URL(coverUrl, currentUrl).href;
        }

        return { title, author, description, coverUrl };
    },

    /**
     * Gera lista de URLs para crawling baseado em intervalo (Range Mode)
     * Padrão FanMTL: nome_da_novel_{numero}.html
     */
    generateChapterUrls: (novelUrl, start, end) => {
        const baseUrl = novelUrl.replace('.html', ''); // Remove extensão .html da URL base
        const links = [];

        for (let i = start; i <= end; i++) {
            links.push({
                link: `${baseUrl}_${i}.html`,
                title: `Capítulo ${i}`, // Título provisório
                number: i
            });
        }

        return links;
    },

    /**
     * Extrai links da página (Scraping Mode)
     * @param {Object} $ - Cheerio
     * @param {String} novelUrl - URL base
     */
    extractChapterLinks: ($, novelUrl) => {
        const links = [];
        $('.chapter-list li a').each((i, el) => {
            const link = $(el).attr('href');
            const title = $(el).text().trim();
            if (link) {
                links.push({ link, title });
            }
        });
        return links;
    }
};
