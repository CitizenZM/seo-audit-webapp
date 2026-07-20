import { NextResponse } from 'next/server';
import { z } from 'zod';
import { generateLlmsTxt, generateSchemaJsonLd, generateFaqMarkup } from '@/lib/activation';

export const runtime = 'nodejs';

const llmsTxtPayload = z.object({
  domain: z.string().min(1).max(255),
  title: z.string().max(200),
  description: z.string().max(2000),
  categories: z
    .array(
      z.object({
        name: z.string().max(100),
        links: z.array(z.object({ title: z.string().max(200), url: z.string().max(2048) })).max(50),
      }),
    )
    .max(20)
    .optional(),
  keyPages: z
    .array(z.object({ title: z.string().max(200), url: z.string().max(2048), description: z.string().max(500).optional() }))
    .max(50)
    .optional(),
});

const schemaPayload = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('Organization'),
    input: z.object({
      name: z.string().min(1).max(200),
      url: z.string().max(2048),
      logo: z.string().max(2048).optional(),
      sameAs: z.array(z.string().max(2048)).max(20).optional(),
      description: z.string().max(2000).optional(),
    }),
  }),
  z.object({
    type: z.literal('Product'),
    input: z.object({
      name: z.string().min(1).max(200),
      description: z.string().max(2000).optional(),
      image: z.union([z.string().max(2048), z.array(z.string().max(2048)).max(20)]).optional(),
      sku: z.string().max(200).optional(),
      brand: z.string().max(200).optional(),
      price: z.union([z.number(), z.string().max(50)]).optional(),
      priceCurrency: z.string().max(10).optional(),
      availability: z.enum(['InStock', 'OutOfStock', 'PreOrder']).optional(),
      url: z.string().max(2048).optional(),
      ratingValue: z.number().optional(),
      reviewCount: z.number().optional(),
    }),
  }),
  z.object({
    type: z.literal('FAQPage'),
    input: z.object({
      questions: z.array(z.object({ q: z.string().min(1).max(500), a: z.string().min(1).max(3000) })).min(1).max(50),
    }),
  }),
]);

const faqMarkupPayload = z.array(z.object({ q: z.string().min(1).max(500), a: z.string().min(1).max(3000) })).min(1).max(50);

const bodySchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('llms-txt'), payload: llmsTxtPayload }),
  z.object({ kind: z.literal('schema'), payload: schemaPayload }),
  z.object({ kind: z.literal('faq-markup'), payload: faqMarkupPayload }),
]);

/**
 * Content Activation Artifacts (#GEO) — generates downloadable llms.txt,
 * schema.org JSON-LD, and FAQ markup from audit-derived input. Pure
 * generators live in @/lib/activation; this route just validates and
 * shapes the response as a file download.
 */
export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
  }

  const body = parsed.data;

  try {
    if (body.kind === 'llms-txt') {
      const text = generateLlmsTxt(body.payload);
      return new NextResponse(text, {
        status: 200,
        headers: {
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': 'attachment; filename="llms.txt"',
        },
      });
    }

    if (body.kind === 'schema') {
      const jsonLd = generateSchemaJsonLd(body.payload);
      return new NextResponse(JSON.stringify(jsonLd, null, 2), {
        status: 200,
        headers: {
          'Content-Type': 'application/ld+json; charset=utf-8',
          'Content-Disposition': `attachment; filename="${body.payload.type.toLowerCase()}-schema.json"`,
        },
      });
    }

    // kind === 'faq-markup'
    const html = generateFaqMarkup(body.payload);
    return new NextResponse(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': 'attachment; filename="faq-markup.html"',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to generate artifact' }, { status: 500 });
  }
}
