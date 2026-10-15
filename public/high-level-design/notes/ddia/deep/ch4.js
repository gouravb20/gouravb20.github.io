// Deep dive: Chapter 4, Encoding and evolution. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch4 = {
  hook: `<p>Your payments service runs on twelve instances. You deploy a version that adds a <code>currency</code> field to every payment record, and the deploy rolls out a few instances at a time. Halfway through, an old instance reads a payment written by a new one, loads it into its model class, updates the status, and saves it back. The <code>currency</code> field is gone, silently dropped because the old code did not know it existed. Nobody notices for a week, until finance asks why some euro payments are now recorded as dollars.</p>
<p>Nothing crashed. The bug lived in the gap between two versions of the code that were running at the same time, both reading and writing the same data. In any system that is deployed without downtime, that gap always exists. Chapter 4 is about encoding data so old and new code can share it safely, and about the three paths data takes between processes: databases, service calls and message queues.</p>`,
  sections: [
    {
      id: "why-compatibility",
      title: "Old and new code always run at the same time",
      kicker: "The problem",
      blocks: [
        {
          type: "problem",
          html: `<p>Applications change, and changes to features usually mean changes to the data they store. But you cannot update every piece of code at the same instant. Servers are upgraded a few at a time in a <strong>rolling upgrade</strong>, and mobile or desktop clients update whenever their users get around to it. Data written by one version will be read by others, in both directions.</p>`,
        },
        {
          type: "text",
          html: `<p>In memory, data lives in objects, structs, lists and hash maps, connected by pointers that only make sense inside one process. To write data to a file or send it over the network you must turn it into a self-contained sequence of bytes. This is called <strong>encoding</strong> (or serialization, or marshalling), and the reverse is <strong>decoding</strong> (deserialization, unmarshalling).</p>
<p>Because old and new versions coexist, the encoding has to support compatibility in both directions:</p>
<ul>
<li><strong>Backward compatibility</strong>: newer code can read data written by older code. This is usually straightforward, because the author of the new code knows what the old format looked like.</li>
<li><strong>Forward compatibility</strong>: older code can read data written by newer code. This is harder, because old code must cope with additions it has never seen, typically by ignoring them, and ideally by preserving them.</li>
</ul>`,
        },
        {
          type: "diagram",
          title: "A rolling upgrade, halfway through",
          caption: "Two instances run the new version and one runs the old version, all sharing one database. New code must read old records (backward compatibility) and old code must read new ones without destroying the fields it does not understand (forward compatibility).",
          svg: `<svg viewBox="0 0 620 280" role="img" aria-label="Two new-version nodes and one old-version node share a database during a rolling upgrade">
<defs><marker id="ddia4-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="30" y="30" width="140" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="100" y="60" text-anchor="middle" font-size="13" font-weight="700">Node A (v2)</text>
<rect x="240" y="30" width="140" height="50" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<text x="310" y="60" text-anchor="middle" font-size="13" font-weight="700">Node B (v2)</text>
<rect x="450" y="30" width="140" height="50" rx="8" style="fill: var(--dg-5-soft); stroke: var(--dg-5)" stroke-width="2"/>
<text x="520" y="60" text-anchor="middle" font-size="13" font-weight="700">Node C (v1)</text>
<rect x="230" y="170" width="160" height="60" rx="8" style="fill: var(--dg-panel); stroke: var(--dg-line)" stroke-width="2"/>
<text x="310" y="205" text-anchor="middle" font-size="13" font-weight="700">Shared database</text>
<line x1="100" y1="80" x2="248" y2="166" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia4-arrow)"/>
<text x="20" y="135" font-size="12" style="fill: var(--dg-muted)">writes a record</text>
<text x="20" y="152" font-size="12" style="fill: var(--dg-muted)">with a new field</text>
<line x1="310" y1="170" x2="310" y2="84" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia4-arrow)"/>
<text x="302" y="125" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">reads old rows</text>
<line x1="372" y1="166" x2="500" y2="84" stroke-width="2" style="stroke: var(--dg-muted)" marker-end="url(#ddia4-arrow)"/>
<text x="610" y="135" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">old code reads it and</text>
<text x="610" y="152" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">must keep unknown fields</text>
<text x="310" y="255" text-anchor="middle" font-size="12">Backward compatible: new code reads old data.</text>
<text x="310" y="273" text-anchor="middle" font-size="12">Forward compatible: old code reads new data.</text>
</svg>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>Forward compatibility has a subtle failure mode, the one in the opening story. Old code decodes a record into a model object, which has no slot for the new field, modifies something, and re-encodes it. The unknown field is lost. Encoding libraries that preserve unknown fields (Protocol Buffers does by default in current versions) prevent this, but only if your application keeps the decoded message around rather than copying it into its own classes.</p>`,
        },
        {
          type: "quiz",
          q: "A new mobile app version starts sending an extra field to your API, while many users keep the old app for months. Your server is updated first. Which compatibility do you need between the old app and the newest server responses?",
          options: [
            "Backward compatibility only",
            "Forward compatibility: the old app must tolerate fields in responses that it does not know about",
            "Neither, because the server is always newer",
            "Only binary compatibility",
          ],
          answer: 1,
          explain: "The old app is old code reading data produced by newer code (the server), which is forward compatibility. The server reading requests from old apps is the backward-compatible direction. Clients that update on users' schedules make both directions necessary for a long time.",
        },
      ],
    },
    {
      id: "language-and-text-formats",
      title: "Language-specific formats and JSON: convenient, with sharp edges",
      kicker: "Formats, part 1",
      blocks: [
        {
          type: "text",
          html: `<p>Many languages ship with built-in serialization: Java's <code>Serializable</code>, Python's <code>pickle</code>, Ruby's <code>Marshal</code>. They are convenient because any object can be saved with one call, but they cause trouble outside a single short-lived process.</p>
<ul>
<li>The format is tied to one language, so another service in another language cannot read it.</li>
<li>Decoding must be able to instantiate arbitrary classes, which is a security hole: an attacker who controls the bytes may be able to run code. Java deserialization exploits were widely publicized in 2015, and Python's own documentation warns that <code>pickle</code> must never be used on untrusted data.</li>
<li>Versioning is an afterthought, and performance is often poor (Java's built-in serialization is notoriously bulky).</li>
</ul>`,
        },
        {
          type: "text",
          html: `<h3>JSON, XML and CSV</h3>
<p>Textual formats are human-readable and supported everywhere, which is why JSON dominates web APIs. They have real problems for data exchange at scale, though.</p>
<p><strong>Numbers are ambiguous.</strong> XML and CSV cannot tell a number from a string of digits without an external schema. JSON distinguishes numbers from strings but not integers from floats, and many parsers (notably JavaScript's) read every number as a 64-bit floating-point value, which represents integers exactly only up to 2<sup>53</sup>. Twitter's API returns tweet IDs, which are 64-bit integers, both as a number and as a string field (<code>id_str</code>) for exactly this reason.</p>
<p><strong>No binary strings.</strong> JSON and XML handle Unicode text but not raw bytes, so binary data is usually Base64-encoded, which makes it about 33% bigger and adds a convention every reader must know.</p>
<p><strong>Schemas are optional and complex.</strong> JSON Schema and XML Schema exist but are not universally used, so the meaning of fields often lives only in application code. CSV has no schema at all, and its escaping rules for commas and newlines inside values are applied inconsistently across tools.</p>
<p>Binary encodings of JSON such as MessagePack and BSON save some space and parsing time, but because they have no schema they must still include every field name in every record.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "Language-native serialization", tone: "bad", html: "Fine for a cache inside one process or a short-lived file. Avoid across services, for storage that outlives a deploy, and always for untrusted input." },
            { title: "JSON and other text formats", tone: "warn", html: "Excellent for public APIs and interchange between organizations, where readability and universal support matter most. Watch out for large integers, binary data and the lack of an enforced schema." },
            { title: "Schema-based binary formats", tone: "ok", html: "Protocol Buffers, Thrift and Avro: compact, fast, and with explicit rules for evolving the schema. The best default inside an organization, for RPC, messaging and large datasets." },
          ],
        },
        {
          type: "quiz",
          q: "A JavaScript client receives a JSON payload containing the order ID 9007199254740993 (2 to the power 53, plus 1). What is the risk?",
          options: [
            "The JSON is invalid",
            "The parser stores numbers as 64-bit floats, so the ID may silently change to a neighboring value",
            "The ID will be converted to a string automatically",
            "There is no risk; JSON supports arbitrary integers",
          ],
          answer: 1,
          explain: "JSON syntax allows the number, but JavaScript parses it into a double, which cannot represent every integer above 2 to the power 53. The value becomes 9007199254740992 with no error. Sending large IDs as strings avoids the problem.",
        },
      ],
    },
    {
      id: "thrift-and-protobuf",
      title: "Thrift and Protocol Buffers: field tags instead of field names",
      kicker: "Formats, part 2",
      blocks: [
        {
          type: "idea",
          html: `<p>Describe the data once in a <strong>schema</strong> written in an interface definition language, and give every field a small number, its <strong>field tag</strong>. The encoded bytes then refer to fields by tag instead of by name, which makes records compact and gives clear rules for evolving the schema.</p>`,
        },
        {
          type: "text",
          html: `<p>Protocol Buffers (protobuf) came from Google and was open-sourced in 2008; Apache Thrift came from Facebook and was open-sourced in 2007. Both work the same way at heart. You write a schema, a code generator produces classes for many languages, and those classes encode and decode the binary format.</p>`,
        },
        {
          type: "code",
          title: "A small protobuf schema",
          lang: "text",
          code: `message User {
  int64  id   = 1;
  string name = 2;
}`,
          caption: "The numbers after the equals signs are field tags. They, not the names, appear in the encoded data.",
        },
        {
          type: "diagram",
          title: "Encoding {id: 1337, name: \"Ada\"} in protobuf",
          caption: "Each field is a tag byte (field number plus wire type) followed by the value. Integers use variable-length encoding, so 1337 takes two bytes. The same record is 24 bytes as compact JSON and 6 bytes in Avro.",
          svg: `<svg viewBox="0 0 620 210" role="img" aria-label="The protobuf encoding of a user record is eight bytes: tag, two-byte varint, tag, length and three characters">
<text x="100" y="52" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">field 1 tag</text>
<text x="280" y="52" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">field 2 tag</text>
<rect x="70" y="65" width="60" height="44" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="130" y="65" width="60" height="44" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<rect x="190" y="65" width="60" height="44" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<rect x="250" y="65" width="60" height="44" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="310" y="65" width="60" height="44" style="fill: var(--dg-3-soft); stroke: var(--dg-3)" stroke-width="2"/>
<rect x="370" y="65" width="60" height="44" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<rect x="430" y="65" width="60" height="44" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<rect x="490" y="65" width="60" height="44" style="fill: var(--dg-4-soft); stroke: var(--dg-4)" stroke-width="2"/>
<g font-family="monospace" font-size="14" font-weight="700" text-anchor="middle">
<text x="100" y="92">08</text>
<text x="160" y="92">B9</text>
<text x="220" y="92">0A</text>
<text x="280" y="92">12</text>
<text x="340" y="92">03</text>
<text x="400" y="92">41</text>
<text x="460" y="92">64</text>
<text x="520" y="92">61</text>
</g>
<text x="190" y="132" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">1337 as varint</text>
<text x="340" y="132" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">length 3</text>
<text x="460" y="132" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">"Ada" in UTF-8</text>
<text x="310" y="180" text-anchor="middle" font-size="13" font-weight="700">8 bytes total</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>Here is how those bytes come about. The first byte, <code>08</code>, packs field number 1 with wire type 0 (varint). Then 1337 is written as a varint: seven bits per byte, low bits first, with the top bit of each byte meaning "more bytes follow", which gives <code>B9 0A</code>. The byte <code>12</code> is field 2 with wire type 2 (length-delimited), followed by the length 3 and the three ASCII bytes of "Ada". No field names appear anywhere. Thrift's BinaryProtocol is less compact, while its CompactProtocol is similar to protobuf.</p>
<h3>How tags make evolution work</h3>
<p><strong>Adding a field</strong>: give it a new tag number. Old code that meets an unknown tag uses the wire type to work out how many bytes to skip, so it ignores the field (forward compatible). New code reading old data simply finds the field absent and uses its default (backward compatible). That only works if the new field is not mandatory, which is why proto3 removed <code>required</code> altogether.</p>
<p><strong>Removing a field</strong>: allowed for fields that are not required, but the tag number must never be reused, because old data containing it still exists. Protobuf has a <code>reserved</code> statement to stop anyone reusing it by accident.</p>
<p><strong>Renaming a field</strong>: free, because names never appear in the encoded data. <strong>Changing a tag number</strong> breaks everything that was written before. <strong>Changing a type</strong> is risky: widening <code>int32</code> to <code>int64</code> works for new readers, but old readers decoding a large value will truncate it.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>Protobuf's design has shifted since 2017. Proto3 originally made it impossible to tell an unset scalar field from one set to its default value (zero, empty string), which caused real bugs; the <code>optional</code> keyword was brought back to proto3 in version 3.15 (2021) to restore explicit field presence. Protobuf over gRPC, which Google open-sourced in 2015, has also become a standard choice for internal service-to-service APIs.</p>`,
        },
        {
          type: "quiz",
          q: "A protobuf field <code>string coupon = 7;</code> is deleted. A year later someone adds <code>int64 discount_cents = 7;</code>. What happens?",
          options: [
            "Nothing; tags can be reused once a field is deleted",
            "Old stored records containing tag 7 as a string will be misinterpreted or fail to decode as the new field",
            "The protobuf compiler automatically renumbers the field",
            "Only the field name matters, so there is no conflict",
          ],
          answer: 1,
          explain: "Encoded data refers to fields only by tag. Records written when tag 7 meant coupon still exist in databases, logs and queues, and new code will try to read them as discount_cents. Marking deleted tags with reserved prevents this mistake.",
        },
      ],
    },
    {
      id: "avro",
      title: "Avro: two schemas, resolved by field name",
      kicker: "Formats, part 3",
      blocks: [
        {
          type: "idea",
          html: `<p>Avro drops field tags entirely. The encoded data is just the values, in the order the schema lists them. To decode, the reader needs the exact schema the data was written with, the <strong>writer's schema</strong>, and compares it with the schema it expects, the <strong>reader's schema</strong>, matching fields by name.</p>`,
        },
        {
          type: "text",
          html: `<p>Avro started in 2009 as a subproject of Hadoop, because Thrift was not a good fit for Hadoop's needs. Its binary encoding is the most compact of the three: our <code>User</code> record encodes to 6 bytes, <code>F2 14</code> for 1337 (Avro zigzag-encodes integers so small negative numbers stay short) and then <code>06</code> plus the three bytes of "Ada" (the length 3 is zigzag-encoded too, as 6). There is nothing in the data to say which field is which, so decoding is impossible without the writer's schema.</p>
<p>The writer's and reader's schemas only need to be <em>compatible</em>, not identical. Avro's schema resolution lines them up by name: fields present in both are read normally, fields in the writer's schema but not the reader's are skipped, and fields the reader expects but the writer did not have are filled with the default value declared in the reader's schema.</p>`,
        },
        {
          type: "diagram",
          title: "Schema resolution",
          caption: "The reader's code is newer: it dropped email and added country. Matching by name, Avro skips email and fills country with its declared default.",
          svg: `<svg viewBox="0 0 620 250" role="img" aria-label="Avro matches writer and reader schema fields by name, skipping fields the reader lacks and defaulting fields the writer lacks">
<defs><marker id="ddia4-arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-ok)"/></marker></defs>
<text x="130" y="28" text-anchor="middle" font-size="13" font-weight="700">Writer's schema (v1)</text>
<text x="490" y="28" text-anchor="middle" font-size="13" font-weight="700">Reader's schema (v2)</text>
<rect x="20" y="40" width="220" height="170" rx="8" style="fill: var(--dg-1-soft); stroke: var(--dg-1)" stroke-width="2"/>
<rect x="380" y="40" width="220" height="170" rx="8" style="fill: var(--dg-2-soft); stroke: var(--dg-2)" stroke-width="2"/>
<g font-family="monospace" font-size="13">
<text x="35" y="80">id: long</text>
<text x="35" y="115">name: string</text>
<text x="35" y="150">email: string</text>
<text x="395" y="80">id: long</text>
<text x="395" y="115">name: string</text>
<text x="395" y="185">country: string</text>
</g>
<text x="395" y="202" font-size="12" style="fill: var(--dg-muted)">default "unknown"</text>
<line x1="240" y1="76" x2="376" y2="76" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia4-arrow2)"/>
<line x1="240" y1="111" x2="376" y2="111" stroke-width="2" style="stroke: var(--dg-ok)" marker-end="url(#ddia4-arrow2)"/>
<line x1="240" y1="146" x2="270" y2="146" stroke-width="2" style="stroke: var(--dg-bad)"/>
<text x="276" y="150" font-size="12" style="fill: var(--dg-bad)">skipped</text>
<text x="372" y="185" text-anchor="end" font-size="12" style="fill: var(--dg-muted)">uses default</text>
<text x="310" y="238" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">Fields are matched by name, never by position or tag.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<h3>Where does the reader get the writer's schema?</h3>
<p>Including the full schema with every record would defeat the compact encoding, so it depends on the context.</p>
<ul>
<li><strong>Large files with many records</strong>: Avro's object container files store the writer's schema once in the file header. This is the typical Hadoop use.</li>
<li><strong>A database of individually written records</strong>: prefix each record with a schema version number and keep a list of schema versions.</li>
<li><strong>Messages on a network connection or stream</strong>: negotiate the schema when the connection is set up, or put a schema ID in every message and look the schema up in a <strong>schema registry</strong>. Confluent Schema Registry, common with Kafka, prefixes each message with a magic byte and a 4-byte schema ID.</li>
</ul>
<p>Because nothing in Avro is tied to tag numbers, it suits <strong>dynamically generated schemas</strong>. To dump a relational table to Avro you can generate a schema from the table definition, using column names as field names. If the table changes, generate a new schema; resolution by name handles the rest. With protobuf, someone would have to assign and track tag numbers by hand.</p>`,
        },
        {
          type: "keypoints",
          title: "Avro evolution rules",
          items: [
            "You may add or remove only fields that have a default value; otherwise new readers cannot fill missing data, or old readers cannot fill fields the new writer omitted.",
            "Avro has no implicit null. A nullable field must be a union such as <code>[\"null\", \"long\"]</code> with default <code>null</code>.",
            "Renaming works backward-compatibly through aliases in the reader's schema, but not forward.",
            "Registries enforce rules on every new version: Confluent Schema Registry's default mode is BACKWARD, and it also offers FORWARD, FULL and transitive variants.",
          ],
        },
        {
          type: "quiz",
          q: "A producer writes Avro messages with schema v3, which added <code>tier: string</code> without a default value. Consumers on v2 are fine, but a newly deployed consumer using v3 crashes on older messages. Why?",
          options: [
            "Avro does not support adding fields",
            "The v3 reader expects tier, older messages were written without it, and there is no default to fill in, so resolution fails",
            "The magic byte is wrong",
            "The v2 consumers corrupted the messages",
          ],
          answer: 1,
          explain: "Backward compatibility requires every field the reader expects but the writer lacked to have a default. Adding tier with a default (or as a nullable union with default null) fixes it. A registry in BACKWARD mode would have rejected v3 before it was deployed.",
        },
      ],
    },
    {
      id: "evolution-rules",
      title: "Schema evolution rules and why schemas are worth it",
      kicker: "Rules of thumb",
      blocks: [
        {
          type: "table",
          title: "Common schema changes and their safety",
          headers: ["Change", "Protobuf / Thrift", "Avro", "Notes"],
          rows: [
            ["Add an optional field", "Safe with a new tag", "Safe with a default", "The basic move for both directions of compatibility"],
            ["Add a required field", "Breaks old data (proto3 has no required)", "Breaks without a default", "New readers cannot fill it for old records"],
            ["Remove an optional field", "Safe; reserve the tag", "Safe if it had a default", "Never reuse the tag or name with a new meaning"],
            ["Rename a field", "Safe (tags carry identity)", "Needs an alias", "Readers that match by name need help"],
            ["Change a field's type", "Only some widenings", "Only promotions like int to long", "Prefer adding a new field and migrating"],
            ["Make required optional", "Safe", "Add a default", "The reverse direction is not safe"],
          ],
        },
        {
          type: "text",
          html: `<p>Schema-based binary formats can look like extra ceremony compared with "just send JSON". The book's argument for them is practical:</p>
<ul>
<li>They are much more compact, because field names are left out of the data.</li>
<li>The schema is documentation that cannot drift from reality, since decoding depends on it.</li>
<li>A registry of schemas lets you check compatibility before deploying, not after something breaks.</li>
<li>In statically typed languages, generated code catches type errors at compile time.</li>
</ul>
<p>The trade-off is that data is not self-describing: you need the schema to read it, which is a burden when debugging by eye. For public APIs consumed by unknown clients, JSON's ubiquity usually still wins.</p>`,
        },
        {
          type: "callout",
          tone: "insight",
          html: `<p>Schema evolution gives you the flexibility that "schemaless" document databases promise, with better guarantees. You still add fields freely, but every change is checked against a rule and every reader knows exactly which shapes it may see.</p>`,
        },
        {
          type: "quiz",
          q: "Which change can be deployed to producers before consumers in a protobuf-based system without breaking anyone?",
          options: [
            "Changing field 3 from string to int64",
            "Adding a new field with a new tag number",
            "Changing the tag of an existing field",
            "Reusing the tag of a deleted field",
          ],
          answer: 1,
          explain: "Old consumers skip unknown tags, so a new field with a fresh tag is forward compatible and can ship to producers first. The other three changes alter how existing bytes are interpreted and break old data or old readers.",
        },
      ],
    },
    {
      id: "dataflow-through-databases",
      title: "Dataflow through databases: data outlives code",
      kicker: "Modes of dataflow, part 1",
      blocks: [
        {
          type: "text",
          html: `<p>Encoded data flows between processes in three main ways: through databases, through service calls, and through asynchronous messages. Each has its own compatibility challenges.</p>
<p>A process that writes to a database encodes data, and a process that reads it later decodes it. Often it is the same service, so you can think of storing something in a database as sending a message to your future self. That makes backward compatibility essential: the future version of your code must read what today's version writes.</p>
<p>Forward compatibility is needed too, because during a rolling upgrade some instances run newer code than others, and a value written by a new instance can then be read, and possibly rewritten, by an old one. This is where the lost-field bug from the opening comes from.</p>`,
        },
        {
          type: "text",
          html: `<h3>Different values written at different times</h3>
<p>A deploy replaces all of your code within minutes. It does not replace your data: a database may contain records written five years ago by code that no longer exists. The phrase used for this is that <strong>data outlives code</strong>.</p>
<p>Rewriting (migrating) every old record into a new schema is possible, but expensive on large datasets, so most databases avoid it when they can. Relational databases let you add a column with a null or constant default without touching existing rows; when an old row is read, the database fills in the default. The database presents one schema even though the stored rows were written under many.</p>
<p>The same idea applies to <strong>archival snapshots</strong>, such as backups or dumps loaded into a data warehouse. These are written in one go and never modified, so it makes sense to encode them all in the latest schema, often in Avro container files or a columnar format like Parquet.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "PostgreSQL and MySQL", title: "Defaults without rewrites", html: "Both can add a column with a constant default without rewriting the table in current versions, storing the default in the catalog and supplying it when old rows are read. Changing a column's type, by contrast, can still rewrite the whole table." },
            { org: "Protocol Buffers", title: "Unknown-field preservation", html: "Generated protobuf classes retain fields they do not recognize and write them back when the message is re-serialized, so an old service that reads, modifies and saves a message does not drop new fields, as long as it works on the message object." },
          ],
        },
        {
          type: "quiz",
          q: "Which situation most needs forward compatibility in a database?",
          options: [
            "A brand-new service writing to an empty table",
            "A rolling upgrade where old instances read and rewrite records produced by new instances",
            "A nightly backup restored by the same version",
            "Adding an index",
          ],
          answer: 1,
          explain: "Forward compatibility is about old code meeting new data. During a rolling upgrade, old instances can load a record with new fields and save it back, so they must at least preserve what they do not understand.",
        },
      ],
    },
    {
      id: "services-and-messages",
      title: "Dataflow through services and messages",
      kicker: "Modes of dataflow, part 2",
      blocks: [
        {
          type: "text",
          html: `<p>When processes talk over a network, the most common pattern is <strong>clients and servers</strong>: the server exposes an API, the client sends requests. In a microservice architecture each service is owned by one team and deployed independently, so servers and clients will run different versions. The usual assumption is that servers are upgraded first, so requests need backward compatibility and responses need forward compatibility.</p>
<h3>REST and RPC</h3>
<p><strong>REST</strong>, described by Roy Fielding in his 2000 dissertation, is a design philosophy built on HTTP: resources identified by URLs, standard methods, and HTTP features for caching, authentication and content negotiation. REST APIs usually exchange JSON and are often described with OpenAPI. They are favored for public APIs because any HTTP client in any language can use them.</p>
<p><strong>Remote procedure calls (RPC)</strong> aim to make a network request look like a local function call. The idea goes back to the 1970s and has been reimplemented many times (CORBA, Java RMI, SOAP), and the book argues it is fundamentally flawed, because a network call is not like a local call:</p>
<ul>
<li>It may fail or time out because of the network, with no way to know whether the request was executed.</li>
<li>Retrying may execute the action twice unless the operation is made <strong>idempotent</strong>, for example with an idempotency key.</li>
<li>Latency varies wildly, from under a millisecond to seconds.</li>
<li>Arguments must be encoded into bytes; you cannot pass a pointer, and large objects are expensive.</li>
<li>Client and server may be in different languages, so types must be translated.</li>
</ul>
<p>Modern RPC frameworks such as gRPC, Thrift and Finagle are more honest about this: they expose futures or streams, deadlines and explicit errors rather than pretending the call is local.</p>`,
        },
        {
          type: "compare",
          items: [
            { title: "REST with JSON", tone: "info", html: "Universal, easy to debug with curl or a browser, huge tool ecosystem. The usual choice for public APIs and anything consumed by browsers or third parties. Contracts are optional and evolution is by convention." },
            { title: "RPC with a schema (gRPC)", tone: "ok", html: "Compact binary encoding, generated clients, streaming, deadlines and strongly typed contracts. The usual choice for internal service-to-service traffic within one organization." },
          ],
        },
        {
          type: "realworld",
          items: [
            { org: "Stripe", title: "Date-based API versions", html: "Stripe names API versions by date. Each account is pinned to the version current when it integrated, and a request can override it with a header, so old integrations keep receiving the response shapes they were built against while new ones get the latest." },
            { org: "Confluent Schema Registry", title: "Compatibility checks for streams", html: "Producers register schemas, and the registry rejects a new version that violates the configured compatibility mode. It started with Avro and now also supports Protobuf and JSON Schema." },
          ],
        },
        {
          type: "text",
          html: `<h3>Asynchronous message passing</h3>
<p>In between databases and RPC sit <strong>message brokers</strong> such as RabbitMQ, Apache Kafka, Amazon SQS and NATS. A sender publishes a message to a named queue or topic and does not wait for it to be processed; the broker stores it and delivers it to one or more consumers. Compared with a direct call, a broker buffers messages if the consumer is down or slow, redelivers after a crash, hides the consumer's network location, lets one message reach many consumers, and decouples the sender from whoever consumes the message. The cost is that communication is one-way: if the sender needs an answer, it comes back on another channel.</p>
<p>Brokers do not care about the encoding, but compatibility still matters, since producers and consumers are deployed independently. A consumer that republishes a message to another topic must also take care to preserve fields it does not understand.</p>
<p>The <strong>actor model</strong> applies message passing within and between processes: each actor has private state and communicates only by asynchronous messages, so the same model works locally and across machines. Erlang/OTP, Akka and Microsoft Orleans are actor frameworks, and rolling upgrades of their clusters raise the same compatibility questions.</p>`,
        },
        {
          type: "callout",
          tone: "modern",
          html: `<p>In 2022 Lightbend moved Akka from the Apache 2.0 license to the Business Source License, and the community responded with Apache Pekko, a fork of Akka 2.6 under the Apache license. If you choose an actor framework today, the license is part of the decision.</p>`,
        },
        {
          type: "quiz",
          q: "A checkout service calls the inventory service over RPC to reserve stock. The call times out. What is the safest way to retry?",
          options: [
            "Retry immediately; a timeout means the request was not processed",
            "Never retry RPC calls",
            "Retry with the same idempotency key, so the inventory service can recognize and ignore a duplicate",
            "Switch to JSON and retry",
          ],
          answer: 2,
          explain: "A timeout does not tell you whether the request was executed; the reply might simply have been lost. Retrying blindly can reserve stock twice. An idempotency key lets the server detect that it already handled the request and return the original result.",
        },
      ],
    },
    {
      id: "interview",
      title: "Using it in a design interview",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Encoding rarely gets its own interview question, but it underlies many follow-ups: "how do you roll this out without downtime?", "what happens when you add a field?", "REST or gRPC between these services?", "why put a queue here?". Answering them well shows you have operated real systems.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<p>When asked how to evolve a schema or API safely:</p>
<ol>
<li>Assume old and new versions run at the same time, during rolling deploys and for clients that update slowly.</li>
<li>Make changes additive: add optional fields with defaults, never repurpose or reuse a field's tag or name.</li>
<li>Deploy readers before writers when a new field must be understood, and keep old readers tolerant of unknown fields.</li>
<li>Enforce it mechanically with a schema registry or contract tests, rather than relying on reviews.</li>
</ol>
<p>Then name the formats: JSON for public APIs, Protobuf over gRPC internally, Avro with a schema registry for Kafka topics and data lake files.</p>`,
        },
        {
          type: "table",
          title: "Which dataflow fits which interaction",
          headers: ["Mode", "Coupling", "Good for", "Watch out for"],
          rows: [
            ["Database", "Across time: data outlives code", "State shared by versions of one service", "Old records, lost unknown fields on rewrite"],
            ["REST or RPC", "Both sides online at once", "Request-response where the caller needs an answer now", "Timeouts, retries, idempotency, cascading failures"],
            ["Message broker", "Loose in time and location", "Background work, fan-out to many consumers, absorbing spikes", "One-way only, duplicates, ordering"],
            ["Actors", "Messages to addresses", "Stateful, concurrent, location-transparent components", "Same versioning issues during cluster upgrades"],
          ],
        },
        {
          type: "quiz",
          q: "You deploy a writer that makes a new field mandatory before upgrading readers, and the new readers also treat the field as required. Which failure is most likely?",
          options: [
            "Old readers crash on new records",
            "New readers fail on old records that lack the field, since there is no default",
            "The database rejects the deployment",
            "Nothing, because binary formats handle this automatically",
          ],
          answer: 1,
          explain: "Old records written before the change do not have the field, and new readers that insist on it cannot fill it in. Old readers usually just ignore the unknown field. The fix is to add the field as optional with a default, migrate or backfill, and only then tighten validation.",
        },
      ],
    },
  ],
  takeaways: [
    "Old and new code always run side by side, during rolling upgrades and on clients that update slowly, so encodings need backward compatibility (new reads old) and forward compatibility (old reads new).",
    "Language-native serialization ties you to one language, has poor versioning and can be a remote-code-execution hole; avoid it across process boundaries.",
    "JSON is universal but ambiguous about numbers, has no binary type and no enforced schema; fine for public APIs, weaker for internal data at scale.",
    "Protobuf and Thrift encode fields by numeric tag: add fields with new tags, never reuse or change a tag, and renames are free.",
    "Avro encodes only values and resolves the writer's and reader's schemas by name; fields can be added or removed only with defaults, and a schema registry supplies the writer's schema.",
    "Data outlives code: databases hold records from every past schema, so readers must handle old shapes and writers must not destroy fields they do not understand.",
    "Network calls are not local calls; design for timeouts and retries with idempotency. Message brokers decouple sender and receiver in time at the cost of one-way communication.",
  ],
  furtherReading: [
    { title: "Protocol Buffers documentation: encoding", url: "https://protobuf.dev/programming-guides/encoding/", note: "The wire format byte by byte: varints, tags, wire types and length-delimited fields." },
    { title: "Apache Avro specification", url: "https://avro.apache.org/docs/current/specification/", note: "Binary encoding, object container files and the exact schema resolution rules." },
    { title: "Architectural Styles and the Design of Network-based Software Architectures (Roy Fielding, 2000)", note: "The dissertation that defined REST." },
    { title: "Confluent Schema Registry documentation", url: "https://docs.confluent.io/platform/current/schema-registry/index.html", note: "Compatibility modes, wire format and how producers and consumers use schema IDs." },
  ],
};
