/**
 * Conector para Central Novel (centralnovel.com)
 */
export const centralnovel = {
    name: 'Central Novel',

    // Verifica se a URL pertence a este conector
    check: (url) => url.includes('centralnovel.com'),

    // Requisitos específicos de requisição
    config: {
        headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Referer': 'https://centralnovel.com/',
        }
    },

    // Seletores CSS
    selectors: {
        title: 'h1.entry-title',
        author: '.infox .spe span a', // Tenta pegar link de autor
        description: '.entry-content[itemprop="description"]',
        cover: '.thumb img',

        // Lista de Capítulos (Atenção: Central Novel costuma ter a lista invertida ou paginada, 
        // mas na página da série exibe uma lista .eplister)
        chapterList: '.eplister li a',

        chapterTitle: '.entry-title', // Conforme solicitado
        chapterContent: 'div.entry-content', // Seletor especifico do usuário
    },

    /**
     * Extrai metadados da página da Novel
     */
    extractMetadata: ($, currentUrl) => {
        const title = $('.entry-title').first().text().trim() || 'Título Desconhecido';

        // Autor muitas vezes está em .infox .spe
        let author = 'Autor Desconhecido';
        const authorEl = $('.infox .spe span').filter((i, el) => $(el).text().includes('Autor'));
        if (authorEl.length > 0) {
            author = authorEl.find('a').text().trim() || authorEl.text().replace('Autor:', '').trim();
        } else {
            // Fallback Genérico
            author = $('.infox .spe a').first().text().trim();
        }

        const description = $('.entry-content[itemprop="description"]').text().trim() || '';

        let coverUrl = $('.thumb img').attr('src') || null;
        if (coverUrl && !coverUrl.startsWith('http')) {
            coverUrl = new URL(coverUrl, currentUrl).href;
        }

        return { title, author, description, coverUrl };
    },

    /**
     * Gera lista de URLs para crawling baseado em intervalo (Range Mode)
     * Padrão Central Novel: https://centralnovel.com/{slug}-capitulo-{numero}/
     */
    generateChapterUrls: (novelUrl, start, end) => {
        // Ex: https://centralnovel.com/series/circle-of-inevitability/
        // Slug: circle-of-inevitability
        let slug = novelUrl.split('/series/')[1];
        if (slug) {
            slug = slug.replace('/', '');
        } else {
            // Fallback caso a URL não tenha /series/ (ex: URL direta do site antigo)
            // Tenta pegar o último segmento válido
            const parts = novelUrl.split('/').filter(p => p);
            slug = parts[parts.length - 1];
        }

        const links = [];
        for (let i = start; i <= end; i++) {
            // Constrói: https://centralnovel.com/circle-of-inevitability-capitulo-300/
            const link = `https://centralnovel.com/${slug}-capitulo-${i}/`;
            links.push({
                link,
                title: `Capítulo ${i}`, // Título provisório
                number: i
            });
        }

        return links;
    },

    /**
     * Extrai links da página (Scraping Mode)
     * Central Novel lista do mais novo para o mais antigo ou vice-versa.
     * Precisamos garantir a ordem correta (1, 2, 3...).
     */
    extractChapterLinks: ($, novelUrl) => {
        const links = [];

        $('.eplister li a').each((i, el) => {
            const link = $(el).attr('href');

            // FILTRO: Ignora links de PDF ou Download
            if (!link || link.includes('/pdf/') || link.includes('download')) {
                return;
            }

            const title = $(el).find('.chapternum').text().trim() || $(el).text().trim();
            const numberStr = $(el).find('.chapternum').text().replace(/[^0-9]/g, '');
            const number = parseInt(numberStr) || (i + 1);

            links.push({
                link,
                title,
                number
            });
        });

        // Remove duplicatas por Link (caso existam)
        const uniqueLinks = links.filter((v, i, a) => a.findIndex(t => t.link === v.link) === i);

        // A lista costuma vir do Último para o Primeiro (Descendente).
        if (uniqueLinks.length > 1) {
            const firstNum = uniqueLinks[0].number;
            const lastNum = uniqueLinks[uniqueLinks.length - 1].number;

            // Se o primeiro item (topo da lista) tem número MAIOR que o último, 
            // significa que a lista está decrescente (ex: Cap 1180 ... Cap 1).
            // Precisamos inverter.
            if (firstNum > lastNum) {
                uniqueLinks.reverse();
            }
        }

        return uniqueLinks;
    },

    /**
     * Limpeza específica para Central Novel
     */
    cleanContent: ($) => {
        const $content = $('div.epcontent.entry-content');

        // Remove elementos indesejados (subtitles, infos, etc)
        $content.find('.cat-series, .entry-info, .related-posts, .sharedaddy').remove();

        // Filtro de Texto (Remove parágrafos com avisos específicos)
        $content.find('p').each((i, el) => {
            const text = $(el).text().trim();
            if (text.includes('Continuação de Lorde dos Mistérios') ||
                text.includes('Log de Alterações Central Novel') ||
                text.includes('Se você possui os direitos legais') ||
                text.includes('Para outros assuntos e reclamações') ||
                text.includes('Esta novel atualmente foi traduzida pela Illusia')) {
                $(el).remove();
            }
            // Remove AVISO isolado se for curto
            if (text === 'AVISO') $(el).remove();
        });
    }
};
