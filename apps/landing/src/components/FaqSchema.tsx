import { useEffect } from 'react';
import { config } from '../config';

export default function FaqSchema() {
  useEffect(() => {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'faq-schema';
    script.text = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: config.faq.map(({ q, a }) => ({
        '@type': 'Question',
        name: q,
        acceptedAnswer: { '@type': 'Answer', text: a }
      }))
    });
    document.head.appendChild(script);
    return () => {
      document.getElementById('faq-schema')?.remove();
    };
  }, []);
  return null;
}
