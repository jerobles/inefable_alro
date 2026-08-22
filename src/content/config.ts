import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    description: z.string(),
    date: z.date(),
    image: z.string().optional(),
    draft: z.boolean().optional().default(false),
  }),
});

const talleres = defineCollection({
  type: 'content',
  schema: z.object({
    titulo: z.string(),
    fecha: z.date(),
    precio: z.number(),
    notaPrecio: z.string().optional().default('todo incluido'),
    duracion: z.string().optional(),
    horario: z.string().optional(),
    descripcion: z.string(),
    incluye: z.array(z.string()).optional().default([]),
    lugar: z.string().optional().default('Calle 155 #14-80, Bogotá'),
    activo: z.boolean().optional().default(true),
  }),
});

export const collections = { blog, talleres };
