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

const titled = { title: text.optional() };
const block = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("text"), html: text }),
  z.strictObject({ type: z.enum(["problem", "idea", "analogy"]), html: text, ...titled }),
  z.strictObject({ type: z.literal("callout"), tone: z.enum(["insight", "warning", "interview", "history", "modern", "tip", "mistake"]), html: text, ...titled }),
  z.strictObject({ type: z.literal("diagram"), svg: z.string().regex(/^\s*(<style[\s\S]*?<\/style>\s*)?<svg[\s\S]*<\/svg>\s*$/), caption: text.optional(), ...titled }),
  z.strictObject({ type: z.literal("realworld"), items: z.array(z.strictObject({ org: text, title: text.optional(), html: text })).min(1), ...titled }),
  z.strictObject({ type: z.literal("tradeoffs"), pros: z.array(text).min(1), cons: z.array(text).min(1), prosLabel: text.optional(), consLabel: text.optional(), ...titled }),
  z.strictObject({ type: z.literal("compare"), items: z.array(z.strictObject({ title: text, html: text, tone: z.enum(["ok", "bad", "warn", "info"]).optional() })).min(2), ...titled }),
  z.strictObject({ type: z.literal("table"), headers: z.array(z.string()), rows: z.array(z.array(z.union([z.string(), z.number()]))), note: text.optional(), ...titled }),
  z.strictObject({ type: z.literal("code"), code: text, lang: z.string().optional(), caption: text.optional(), ...titled }),
  z.strictObject({ type: z.enum(["steps", "keypoints", "list"]), items: z.array(text).min(1), ...titled }),
  z.strictObject({ type: z.literal("quiz"), q: text, options: z.array(text).min(2), answer: z.number().int().min(0), explain: text }),
  z.strictObject({ type: z.literal("lab"), id: z.string(), caption: text.optional() }),
]);
const section = z.strictObject({ id: z.string().regex(/^[a-z0-9-]+$/), title: text, kicker: text.optional(), blocks: z.array(block).min(1) });

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
  problem: z.array(section).min(1).optional(),
  solution: z.array(section).min(1).optional(),
  levels: z.array(section).min(1).optional(),
});

const deepDive = z.strictObject({
  hook: text,
  sections: z.array(section).min(1),
  takeaways: z.array(text),
  furtherReading: z.array(z.strictObject({ title: text, url: z.url().optional(), note: text.optional() })).optional(),
});

const schema = z
  .strictObject({
    track: z.string(),
    slug: z.string(),
    labScripts: z.array(z.string()),
    deep: z.record(z.string(), deepDive),
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
      const tabs = [ch.problem, ch.solution, ch.levels];
      if (tabs.some(Boolean) && !tabs.every(Boolean)) issue("a problem breakdown needs problem, solution and levels");
      checkSections(tabs.flatMap(t => t ?? []), issue);
      // A problem has no Labs tab, so a lab it lists that no section embeds would never be shown.
      if (ch.problem) {
        const embedded = new Set([...tabs.flatMap(t => t ?? []), ...(d.deep[ch.id]?.sections ?? [])]
          .flatMap(s => s.blocks.flatMap(b => (b.type === "lab" ? [b.id] : []))));
        for (const id of ch.labs) if (!embedded.has(id)) issue(`lab ${id} is listed but no section embeds it`);
      }
    }
    for (const [id, deep] of Object.entries(d.deep)) {
      const issue = (message: string) => ctx.addIssue({ code: "custom", message: `deep dive ${id}: ${message}` });
      if (!ids.has(id)) issue("no chapter has this id");
      checkSections(deep.sections, issue);
    }

    function checkSections(sections: z.infer<typeof section>[], issue: (message: string) => void) {
      const seen = new Set<string>();
      for (const s of sections) {
        if (seen.has(s.id)) issue(`duplicate section id ${s.id}`);
        seen.add(s.id);
        for (const b of s.blocks) {
          if (b.type === "lab" && !d.labInfo[b.id]) issue(`section ${s.id} embeds missing lab ${b.id}`);
          if (b.type === "quiz" && b.answer >= b.options.length) issue(`section ${s.id}: quiz answer ${b.answer} is out of range`);
        }
      }
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
          const { DATA, DEMOS, DEEP, errors } = loadApp(app);
          if (errors.length) throw new Error(errors.join("\n"));
          const id = `${app.track}/${app.slug}`;
          const labInfo = Object.fromEntries(Object.entries(DEMOS).map(([k, v]) => [k, { title: v.title, blurb: v.blurb }]));
          // Plain objects from this realm; the vm context's objects have their own prototypes.
          const raw = JSON.parse(JSON.stringify({ ...DATA, track: app.track, slug: app.slug, labScripts: app.labScripts, labInfo, deep: DEEP }));
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
