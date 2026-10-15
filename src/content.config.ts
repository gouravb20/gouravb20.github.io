import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { fileURLToPath } from "node:url";
import { findApps, loadApp } from "./lib/notes-source.mjs";

// Mirrors public/shared/notes.d.ts. Strings are HTML.
const text = z.string().min(1);

const concept = z.strictObject({
  term: text,
  def: text,
  why: text.optional(),
  ex: text.optional(),
  demo: z.string().optional(),
});

const sheetBase = { title: text, note: text.optional() };
const cheatsheet = z.discriminatedUnion("type", [
  z.strictObject({ ...sheetBase, type: z.literal("table"), headers: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))) }),
  z.strictObject({ ...sheetBase, type: z.literal("list"), items: z.array(text) }),
  z.strictObject({ ...sheetBase, type: z.literal("code"), body: text }),
]);

const chapter = z.strictObject({
  id: z.string().regex(/^[\w-]+$/),
  part: z.number(),
  number: z.union([z.number(), z.string()]),
  title: text,
  overview: text,
  source: z.strictObject({ title: text, url: z.url() }).optional(),
  concepts: z.array(concept),
  labs: z.array(z.string()),
  cheatsheet: z.array(cheatsheet),
  interview: z.array(z.strictObject({ q: text, a: text, diff: z.enum(["easy", "med", "medium", "hard"]).optional() })),
});

const schema = z
  .strictObject({
    track: z.string(),
    slug: z.string(),
    labScripts: z.array(z.string()),
    labInfo: z.record(z.string(), z.strictObject({ title: text, blurb: text })),
    book: z.strictObject({
      title: text,
      subtitle: text,
      storageKey: text,
      appId: text,
      exportPrefix: text,
      pillarsTitle: text,
      takeawaysTitle: text,
      labsIntro: text,
      mono: text.optional(),
      shortTitle: text.optional(),
      tagline: text.optional(),
    }),
    parts: z.record(z.string(), text),
    fourQuestions: z.array(z.strictObject({ q: text, cls: z.enum(["what", "where", "when", "how"]), text, answer: text })),
    takeaways: z.array(text),
    chapters: z.array(chapter).min(1),
  })
  .superRefine((d, ctx) => {
    const ids = new Set<string>();
    for (const ch of d.chapters) {
      const issue = (message: string) => ctx.addIssue({ code: "custom", message: `chapter ${ch.id}: ${message}` });
      if (ids.has(ch.id)) issue("duplicate id");
      ids.add(ch.id);
      if (!d.parts[ch.part]) issue(`part ${ch.part} is not in parts`);
      for (const id of ch.labs) if (!d.labInfo[id]) issue(`lab ${id} is not defined in any demos file`);
      for (const c of ch.concepts) if (c.demo && !d.labInfo[c.demo]) issue(`concept "${c.term}" links to missing lab ${c.demo}`);
    }
  });

const notes = defineCollection({
  loader: {
    name: "notes-apps",
    async load({ store, parseData, generateDigest, config, watcher, logger }) {
      const publicDir = fileURLToPath(config.publicDir);
      const sync = async () => {
        store.clear();
        for (const app of findApps(publicDir)) {
          if (app.legacy) continue;
          const { DATA, DEMOS, errors } = loadApp(app);
          if (errors.length) throw new Error(errors.join("\n"));
          const id = `${app.track}/${app.slug}`;
          const labInfo = Object.fromEntries(Object.entries(DEMOS).map(([k, v]) => [k, { title: v.title, blurb: v.blurb }]));
          // Plain objects from this realm; the vm context's objects have their own prototypes.
          const raw = JSON.parse(JSON.stringify({ ...DATA, track: app.track, slug: app.slug, labScripts: app.labScripts, labInfo }));
          const data = await parseData({ id, data: raw });
          store.set({ id, data, digest: generateDigest(data) });
        }
      };
      await sync();
      watcher?.on("change", async file => {
        if (!file.startsWith(publicDir) || !/[\\/]notes[\\/].+\.js$/.test(file)) return;
        logger.info(`Reloading notes data (${file})`);
        await sync();
      });
    },
  },
  schema,
});

export const collections = { notes };
