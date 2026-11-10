import { readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const home = await readFile(new URL('index.html', dist), 'utf8');
const origin = 'https://exams-studio.vercel.app';
const publicPages = {
  docs: ['Exam Studio Documentation', 'Learn how to create study notes, handouts and exams, manage your Library and connect AI tools in Exam Studio.'],
  privacy: ['Exam Studio Privacy Policy', 'Learn what information Exam Studio collects, how it is used and what choices you have about your data.'],
  terms: ['Exam Studio Terms of Service', 'Read the terms for using Exam Studio, including account responsibilities and acceptable use.'],
};

function pageHtml({ title, description, canonical, robots = 'index,follow' }) {
  return home
    .replace(/<meta name=['"]google-site-verification['"] [^>]*>\r?\n?/, '')
    .replace(/<title>[^<]*<\/title>/, `<title>${title}</title>`)
    .replace(/<meta name=['"]robots['"] [^>]*>/, `<meta name="robots" content="${robots}">`)
    .replace(/<link rel=['"]canonical['"] [^>]*>/, canonical ? `<link rel="canonical" href="${canonical}">` : '')
    .replace(/<meta property=['"]og:url['"] [^>]*>/, canonical ? `<meta property="og:url" content="${canonical}">` : '')
    .replace(/<meta (name|property)=['"](description|og:description|twitter:description)['"] [^>]*>/g,
      (_, attr, name) => `<meta ${attr}="${name}" content="${description}">`)
    .replace(/<meta (name|property)=['"](og:title|twitter:title)['"] [^>]*>/g,
      (_, attr, name) => `<meta ${attr}="${name}" content="${title}">`)
    .replace(/<script type=['"]application\/ld\+json['"]>[\s\S]*?<\/script>/, '');
}

await Promise.all([
  ...Object.entries(publicPages).map(([path, [title, description]]) =>
    writeFile(new URL(`${path}.html`, dist), pageHtml({ title, description, canonical: `${origin}/${path}` }))),
  writeFile(new URL('private.html', dist), pageHtml({
    title: 'Exam Studio',
    description: 'Access your Exam Studio account.',
    robots: 'noindex',
  })),
]);
