// Deep dive: Chapter 10, Working with TCP/IP and WebSocket. Format: DeepDive in public/shared/notes.d.ts; guide: "Writing a deep dive" in README.md.
window.DEEP = window.DEEP || {};
DEEP.ch10 = {
  hook: `<p>You write a tiny chat protocol over TCP. The client calls <code>conn.Write()</code> once per message, the server calls <code>conn.Read()</code> once per message, and on your laptop it works perfectly. Then a colleague in another office tries it: some messages arrive glued together, long ones arrive cut in half, and the server treats the second half as a new, garbled command.</p>
<p>Nothing is broken in the network. TCP promised to deliver your bytes reliably and in order, and it did. It never promised to keep your <em>messages</em> apart. That gap between what the transport guarantees and what your program assumes is the theme of this chapter, which drops below HTTP to the <code>net</code> package, raw TCP and UDP sockets, concurrent servers, WebSocket and, finally, a message broker.</p>`,
  sections: [
    {
      id: "tcp-vs-udp",
      title: "TCP and UDP: what each transport actually promises",
      kicker: "The foundation",
      blocks: [
        {
          type: "text",
          html: `<p><strong>IP</strong> moves packets between hosts by address and makes no promises: packets can be lost, duplicated or reordered. IPv4 addresses are 32 bits; IPv6 addresses are 128 bits. The two transports built on top of it make very different promises.</p>
<p><strong>TCP</strong> sets up a connection with a three-way handshake, then gives both sides a full-duplex <em>byte stream</em>. Lost segments are retransmitted, bytes arrive in order, and flow and congestion control slow the sender down when the receiver or the network can't keep up. The price is the handshake, retransmission delays, and head-of-line blocking: one lost segment holds up everything behind it.</p>
<p><strong>UDP</strong> has no connection and no handshake. Each <code>Write</code> sends one independent datagram that may be lost, duplicated or reordered, and nothing slows the sender down. In exchange you get low latency and preserved message boundaries: one datagram in, one datagram out.</p>`,
        },
        {
          type: "lab",
          id: "c10TcpUdp",
          caption: "Send the same numbered messages over TCP and UDP across a link that drops and delays packets. TCP pays for the handshake and retransmissions but delivers everything in order; UDP is immediate and lossy.",
        },
        {
          type: "table",
          headers: ["Property", "TCP", "UDP"],
          rows: [
            ["Setup", "Three-way handshake", "None"],
            ["Delivery and order", "Reliable, in order", "Best effort, any order"],
            ["Message boundaries", "No: a byte stream", "Yes: one datagram per read"],
            ["Typical uses", "HTTP/1.1 and HTTP/2, databases, SSH", "DNS, games, VoIP, metrics, QUIC"],
          ],
        },
        {
          type: "text",
          html: `<p>Go's network names mirror the address families. <code>"tcp"</code> and <code>"udp"</code> accept IPv4 and IPv6, while <code>"tcp4"</code>, <code>"tcp6"</code>, <code>"udp4"</code> and <code>"udp6"</code> restrict the family. That matters for <code>localhost</code>, which may resolve to <code>::1</code> first: a server listening only on <code>tcp4</code> then refuses a client that tried IPv6.</p>`,
        },
        {
          type: "quiz",
          q: "A UDP server reads into a 1,500-byte buffer with ReadFrom. Two clients each send a 100-byte datagram at nearly the same time. What does the first ReadFrom return?",
          options: [
            "200 bytes: both datagrams merged",
            "Exactly one 100-byte datagram, plus the sender's address",
            "Whatever bytes have arrived so far, possibly part of a datagram",
            "An error, because UDP needs Accept first",
          ],
          answer: 1,
          explain: "UDP preserves message boundaries. Each read returns exactly one datagram (truncated only if the buffer is too small), together with the address it came from. Merging and splitting are TCP behaviours.",
        },
      ],
    },
    {
      id: "net-package",
      title: "The net package: Dial, Listen and packet sockets",
      kicker: "How it works",
      blocks: [
        {
          type: "idea",
          html: `<p><code>net.Dial</code> makes you a client and <code>net.Listen</code> makes you a server. Both hand you a <code>net.Conn</code>, which is an <code>io.Reader</code> and an <code>io.Writer</code>. Everything you know about files, <code>bufio</code>, <code>fmt.Fprintf</code> and <code>io.Copy</code>, works over the network unchanged.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A line-based TCP client",
          code: `func main() {
	conn, err := net.DialTimeout("tcp", "localhost:1234", 3*time.Second)
	if err != nil {
		log.Fatal(err)
	}
	defer conn.Close()

	in := bufio.NewScanner(os.Stdin)
	replies := bufio.NewReader(conn)
	for in.Scan() {
		if _, err := fmt.Fprintln(conn, in.Text()); err != nil {
			log.Fatal(err)
		}
		line, err := replies.ReadString('\\n')
		if err != nil {
			log.Fatal(err)
		}
		fmt.Print("-> ", line)
	}
}`,
        },
        {
          type: "text",
          html: `<p>The book also shows the typed path: <code>net.ResolveTCPAddr</code> plus <code>net.DialTCP</code> returns a <code>*net.TCPConn</code> with TCP-specific methods such as <code>SetKeepAlive</code>, <code>SetNoDelay</code> and <code>CloseWrite</code> (a half-close that tells the peer you are done sending). Go already disables Nagle's algorithm on TCP connections by default, so small writes go out immediately. Most code is happy with the generic <code>net.Dial</code>, and a <code>net.Dialer</code> adds a timeout, keep-alive settings and a context.</p>
<p>UDP servers look different because there are no connections to accept. One socket receives datagrams from everyone, and each read reports who sent it.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A UDP server: one socket for every client",
          code: `func main() {
	pc, err := net.ListenPacket("udp", ":1234")
	if err != nil {
		log.Fatal(err)
	}
	defer pc.Close()
	buf := make([]byte, 1500)
	for {
		n, addr, err := pc.ReadFrom(buf)
		if err != nil {
			log.Println(err)
			continue
		}
		reply := strings.ToUpper(string(buf[:n]))
		if _, err := pc.WriteTo([]byte(reply), addr); err != nil {
			log.Println(err)
		}
	}
}`,
          caption: "Use buf[:n], never the whole buffer: the bytes after n are left over from earlier datagrams.",
        },
        {
          type: "text",
          html: `<p>A "connected" UDP client (<code>net.DialUDP</code>) only fixes the default destination and filters incoming datagrams; no handshake happens and no delivery is promised. If the reply is lost, a blocking read waits forever, so UDP clients set a read deadline and retry. Because one socket serves everyone, any client can affect shared state: in the book's random-number server, a single client sending <code>STOP</code> shuts the server down for all of them.</p>
<p>For testing, <code>nc</code> (netcat) is the universal partner: <code>nc -l 1234</code> is a TCP server, <code>nc host 1234</code> a TCP client, and <code>-u</code> switches either to UDP. You can test your client before the server exists, and the other way round.</p>`,
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p>UDP source addresses are easy to forge. A server that answers a small request with a large reply can be abused to flood a victim whose address was spoofed (an amplification attack). Keep replies no larger than requests unless the client has proven it owns its address.</p>`,
        },
      ],
    },
    {
      id: "concurrent-server",
      title: "The concurrent TCP server: one goroutine per connection",
      kicker: "The core pattern",
      blocks: [
        {
          type: "problem",
          html: `<p>The book's first TCP server calls <code>Accept()</code> once, before its loop, so it talks to exactly one client forever. Moving <code>Accept()</code> into the loop but handling each client inline is only slightly better: the server becomes sequential, and client two waits until client one disconnects.</p>`,
        },
        {
          type: "text",
          html: `<p>The fix is the pattern behind nearly every Go server: the main goroutine loops on <code>Accept()</code> and hands each new connection to its own goroutine. Goroutines start with small stacks and the runtime parks them cheaply while they wait on the network, so a goroutine per connection scales to many thousands of clients without an event loop or callbacks. The code stays sequential and readable inside each handler.</p>`,
        },
        {
          type: "diagram",
          title: "The accept loop hands each connection to its own goroutine",
          caption: "The main goroutine only accepts. Each accepted net.Conn is served by a dedicated goroutine, so a slow client never blocks the others.",
          svg: `<svg viewBox="0 0 640 240" role="img" aria-label="Three clients connect to an accept loop, which starts one goroutine per connection">
<defs><marker id="go10-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" style="fill: var(--dg-muted)"/></marker></defs>
<rect x="20" y="30" width="100" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="70" y="55" text-anchor="middle" font-size="12">client 1</text>
<rect x="20" y="95" width="100" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="70" y="120" text-anchor="middle" font-size="12">client 2</text>
<rect x="20" y="160" width="100" height="40" rx="6" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="70" y="185" text-anchor="middle" font-size="12">client 3</text>
<rect x="200" y="90" width="180" height="50" rx="6" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="290" y="111" text-anchor="middle" font-size="12" font-weight="700">Accept loop</text>
<text x="290" y="129" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">main goroutine</text>
<rect x="460" y="30" width="160" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="540" y="55" text-anchor="middle" font-size="12">go handle(c1)</text>
<rect x="460" y="95" width="160" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="540" y="120" text-anchor="middle" font-size="12">go handle(c2)</text>
<rect x="460" y="160" width="160" height="40" rx="6" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="540" y="185" text-anchor="middle" font-size="12">go handle(c3)</text>
<line x1="120" y1="50" x2="198" y2="105" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go10-arrow)"/>
<line x1="120" y1="115" x2="198" y2="115" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go10-arrow)"/>
<line x1="120" y1="180" x2="198" y2="125" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go10-arrow)"/>
<line x1="380" y1="105" x2="458" y2="50" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go10-arrow)"/>
<line x1="380" y1="115" x2="458" y2="115" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go10-arrow)"/>
<line x1="380" y1="125" x2="458" y2="180" stroke-width="1.5" style="stroke: var(--dg-muted)" marker-end="url(#go10-arrow)"/>
<text x="320" y="228" text-anchor="middle" font-size="12" style="fill: var(--dg-muted)">After Accept returns, main goes straight back to accepting.</text>
</svg>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Accept loop, per-connection goroutine, deadlines and shutdown",
          code: `func serve(l net.Listener) error {
	for {
		c, err := l.Accept()
		if err != nil {
			if errors.Is(err, net.ErrClosed) {
				return nil // someone called l.Close(): shut down
			}
			return err
		}
		go handle(c)
	}
}

func handle(c net.Conn) {
	defer c.Close()
	r := bufio.NewReader(c)
	for {
		c.SetReadDeadline(time.Now().Add(time.Minute))
		line, err := r.ReadString('\\n')
		if err != nil {
			return // EOF, idle timeout or reset
		}
		fmt.Fprint(c, strings.ToUpper(line))
	}
}`,
        },
        {
          type: "text",
          html: `<p>Three details separate a toy from a server. <code>defer c.Close()</code> sits at the top of the handler so every exit path releases the file descriptor. A read deadline, refreshed on each message, means a client that vanishes without closing (a laptop lid shut, a NAT entry expired) does not pin a goroutine forever. And closing the listener from another goroutine makes <code>Accept</code> return <code>net.ErrClosed</code>, which is the hook for a clean shutdown.</p>`,
        },
        {
          type: "lab",
          id: "c10ConcTcp",
          caption: "Clients connect one after another and keep their sessions open. Compare Accept once, an inline sequential loop, and a goroutine per connection.",
        },
        {
          type: "realworld",
          items: [
            { org: "net/http", title: "The same loop inside", html: "<code>http.Server.Serve</code> is an accept loop that starts a goroutine for each connection. Everything in the previous chapter sits on top of exactly this pattern." },
            { org: "CoreDNS", title: "UDP at scale", html: "CoreDNS, the default cluster DNS server in Kubernetes, is written in Go and answers DNS queries over UDP (and TCP for large responses), the textbook case for datagrams." },
          ],
        },
        {
          type: "quiz",
          q: "The book's tcpS.go calls Accept once, outside the loop. A second client runs nc localhost 1234 while the first is still connected. What does the second client see?",
          options: [
            "Connection refused",
            "The connection opens, but its messages are never answered",
            "It shares the first client's session and sees its replies",
            "The server crashes",
          ],
          answer: 1,
          explain: "The kernel completes the TCP handshake for pending connections in the listen backlog before the program accepts them, so the connect succeeds. But the program never calls Accept again, so nothing ever reads from that connection.",
        },
      ],
    },
    {
      id: "framing",
      title: "Framing: turning a byte stream into messages",
      kicker: "The classic bug",
      blocks: [
        {
          type: "problem",
          html: `<p>TCP keeps the order of bytes, not the boundaries of your writes. One 100-byte <code>Write</code> may arrive as reads of 60 and 40 bytes, and two small writes may arrive in a single read. Code that assumes "one Read equals one message" works on localhost and fails across real networks, under load or with large messages.</p>`,
        },
        {
          type: "diagram",
          title: "Write boundaries are not preserved",
          caption: "Three writes on the sender can surface as any split on the receiver. Only a framing rule tells the reader where each message ends.",
          svg: `<svg viewBox="0 0 640 210" role="img" aria-label="Three writes on the sender arrive as three differently split reads on the receiver">
<text x="20" y="24" font-size="12" font-weight="700">Sender: three Write calls</text>
<rect x="20" y="34" width="200" height="34" rx="4" style="fill: var(--dg-1-soft); stroke: var(--dg-1)"/>
<text x="120" y="56" text-anchor="middle" font-size="12">HELLO\\n</text>
<rect x="220" y="34" width="140" height="34" rx="4" style="fill: var(--dg-2-soft); stroke: var(--dg-2)"/>
<text x="290" y="56" text-anchor="middle" font-size="12">HI\\n</text>
<rect x="360" y="34" width="260" height="34" rx="4" style="fill: var(--dg-3-soft); stroke: var(--dg-3)"/>
<text x="490" y="56" text-anchor="middle" font-size="12">GOODBYE\\n</text>
<line x1="220" y1="72" x2="220" y2="160" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<line x1="360" y1="72" x2="360" y2="160" stroke-dasharray="4 4" style="stroke: var(--dg-line)"/>
<text x="20" y="110" font-size="12" font-weight="700">Receiver: what Read may return</text>
<rect x="20" y="120" width="130" height="34" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="85" y="142" text-anchor="middle" font-size="12">Read 1</text>
<rect x="150" y="120" width="280" height="34" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="290" y="142" text-anchor="middle" font-size="12">Read 2</text>
<rect x="430" y="120" width="190" height="34" rx="4" style="fill: var(--dg-panel); stroke: var(--dg-line)"/>
<text x="525" y="142" text-anchor="middle" font-size="12">Read 3</text>
<text x="20" y="192" font-size="12" style="fill: var(--dg-muted)">TCP preserves byte order, not write boundaries. Framing restores the messages.</text>
</svg>`,
        },
        {
          type: "text",
          html: `<p>There are three standard ways to frame. A <strong>delimiter</strong>, such as the newline the book uses with <code>bufio.Reader.ReadString('\\n')</code>, is simple and human-readable but needs escaping if the payload can contain the delimiter. A <strong>length prefix</strong> writes the payload size first, so the reader knows exactly how many bytes to wait for; it handles binary data and is easy to bound. A <strong>self-delimiting encoding</strong> such as <code>json.Decoder</code> or <code>encoding/gob</code> on the stream knows where each value ends.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "Length-prefixed frames",
          code: `func writeFrame(w io.Writer, payload []byte) error {
	var hdr [4]byte
	binary.BigEndian.PutUint32(hdr[:], uint32(len(payload)))
	if _, err := w.Write(hdr[:]); err != nil {
		return err
	}
	_, err := w.Write(payload)
	return err
}

func readFrame(r io.Reader, max uint32) ([]byte, error) {
	var hdr [4]byte
	if _, err := io.ReadFull(r, hdr[:]); err != nil {
		return nil, err
	}
	n := binary.BigEndian.Uint32(hdr[:])
	if n > max {
		return nil, fmt.Errorf("frame of %d bytes exceeds limit %d", n, max)
	}
	buf := make([]byte, n)
	_, err := io.ReadFull(r, buf)
	return buf, err
}`,
          caption: "io.ReadFull keeps reading until the buffer is full, which is exactly what a plain Read does not promise. The size limit stops a hostile peer from making you allocate gigabytes.",
        },
        {
          type: "realworld",
          items: [
            { org: "NATS", title: "Both techniques in one protocol", html: "The NATS messaging protocol, implemented by a server written in Go, sends text control lines ended by CRLF, and a publish line carries the payload's byte count so the binary payload that follows can be read exactly." },
          ],
        },
        {
          type: "quiz",
          q: "A client sends \"PING\\n\" twice in quick succession. The server calls conn.Read(buf) once with a 1 KB buffer. Which outcomes are possible?",
          options: [
            "Only \"PING\\n\", because each write is delivered separately",
            "Only \"PING\\nPING\\n\", because both fit in the buffer",
            "Any prefix of the ten bytes, for example \"PI\", \"PING\\n\" or \"PING\\nPING\\n\"",
            "An error, because two writes happened before the read",
          ],
          answer: 2,
          explain: "Read returns whatever bytes are available, at least one. Write boundaries are invisible to the receiver, so the server must frame (here, read up to each newline) instead of trusting a single Read.",
        },
      ],
    },
    {
      id: "websocket",
      title: "WebSocket: full duplex for the browser",
      kicker: "Beyond request and response",
      blocks: [
        {
          type: "problem",
          html: `<p>HTTP is request and response: the server speaks only when asked. A chat room, a live dashboard or a multiplayer game needs the server to push at any moment, and polling for updates wastes requests and adds latency. Raw TCP would work, but browsers can't open raw sockets.</p>`,
        },
        {
          type: "text",
          html: `<p>WebSocket (RFC 6455) starts as an ordinary HTTP/1.1 request carrying <code>Upgrade: websocket</code> and a random <code>Sec-WebSocket-Key</code>. The server replies <code>101 Switching Protocols</code> with a <code>Sec-WebSocket-Accept</code> header, computed by hashing the key with a fixed GUID (SHA-1, then base64). That proves the server really understood the WebSocket handshake; it is not authentication. From then on the same TCP connection carries <strong>frames</strong> in both directions: text, binary, ping, pong and close. Frames from client to server are masked, which protects badly written proxies from cache poisoning.</p>
<p>Unlike raw TCP, WebSocket has message boundaries: one <code>WriteMessage</code> arrives as one <code>ReadMessage</code>. URLs use <code>ws://</code> and <code>wss://</code>.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "An echo endpoint with gorilla/websocket and an origin allowlist",
          code: `var allowed = map[string]bool{"https://app.example.com": true}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return allowed[r.Header.Get("Origin")]
	},
}

func echo(w http.ResponseWriter, r *http.Request) {
	ws, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return // Upgrade has already replied with an HTTP error
	}
	defer ws.Close()
	ws.SetReadLimit(64 << 10)
	for {
		kind, msg, err := ws.ReadMessage()
		if err != nil {
			return // includes the peer's close frame
		}
		if err := ws.WriteMessage(kind, msg); err != nil {
			return
		}
	}
}`,
        },
        {
          type: "lab",
          id: "c10WebSocket",
          caption: "Compute Sec-WebSocket-Accept from a key, then type a message to see masked client frames and unmasked server frames. Switch the page's Origin to an attacker's site to see what CheckOrigin returning true allows.",
        },
        {
          type: "text",
          html: `<p>After <code>Upgrade</code> the connection is no longer HTTP: writing to <code>w</code> corrupts it. gorilla/websocket supports <strong>one concurrent reader and one concurrent writer</strong> per connection, so servers that push from several places funnel all writes through a single goroutine fed by a channel. A clean client sends a close frame with code 1000 (normal closure) and waits briefly for the server's reply, which is why the book's client logs <code>close 1000 (normal)</code> instead of 1005 (no status). <code>websocat</code> plays the role of <code>nc</code> for testing.</p>`,
        },
        {
          type: "callout",
          tone: "mistake",
          html: `<p>Browsers send an <code>Origin</code> header with WebSocket handshakes, but the same-origin policy and CORS do not restrict them. A <code>CheckOrigin</code> that returns <code>true</code> for everyone, as in the book's example, lets any web page open a socket to your server with the visitor's cookies (cross-site WebSocket hijacking). gorilla's default, a nil <code>CheckOrigin</code>, rejects cross-origin handshakes; if you override it, use an allowlist.</p>`,
        },
        {
          type: "callout",
          tone: "tip",
          html: `<p><code>http.Server.Shutdown</code> does not track hijacked connections such as WebSockets. Keep your own registry of open sockets and send them close frames during shutdown.</p>`,
        },
      ],
    },
    {
      id: "rabbitmq",
      title: "Message queues: decoupling in time with RabbitMQ",
      kicker: "Asynchronous messaging",
      blocks: [
        {
          type: "text",
          html: `<p>TCP and WebSocket connect two programs that are running at the same time. A message broker removes that requirement: a <strong>producer</strong> publishes a message, the broker stores it in a queue, and a <strong>consumer</strong> processes it whenever it is ready, even if it was down when the message was sent. RabbitMQ speaks AMQP 0-9-1, and the Go client maintained by the RabbitMQ team is <code>github.com/rabbitmq/amqp091-go</code>.</p>
<p>The book's producer dials the broker, opens a channel, declares a queue and publishes with <code>PublishWithContext</code>. The consumer calls <code>Consume</code> and ranges over the delivery channel. Both work, and both take shortcuts that matter in production.</p>`,
        },
        {
          type: "code",
          lang: "go",
          title: "A consumer with manual acknowledgements",
          code: `func consume(ch *amqp.Channel, process func([]byte) error) error {
	if _, err := ch.QueueDeclare("jobs", true, false, false, false, nil); err != nil {
		return err
	}
	if err := ch.Qos(10, 0, false); err != nil { // at most 10 unacked at once
		return err
	}
	msgs, err := ch.Consume("jobs", "", false, false, false, false, nil)
	if err != nil {
		return err
	}
	for d := range msgs {
		if err := process(d.Body); err != nil {
			d.Nack(false, false) // reject; a dead-letter queue can catch it
			continue
		}
		d.Ack(false)
	}
	return nil
}`,
        },
        {
          type: "compare",
          items: [
            { title: "Book: autoAck = true", tone: "bad", html: "The broker forgets a message the moment it is delivered. If the consumer crashes mid-processing, the message is gone: at-most-once delivery. The queue is non-durable, so a broker restart also loses it." },
            { title: "Manual acks, durable queue", tone: "ok", html: "The consumer acks only after processing; unacked messages are redelivered if the consumer dies. Combined with persistent messages and idempotent handlers, this gives at-least-once delivery. <code>Qos</code> limits how many unacked messages one consumer holds." },
          ],
        },
        {
          type: "callout",
          tone: "warning",
          html: `<p><code>QueueDeclare</code> creates the queue if it doesn't exist, so a typo in the queue name silently creates a new, empty queue that nobody reads. Requeueing a message that always fails (<code>Nack</code> with requeue set to true) loops forever; send poison messages to a dead-letter queue instead. And load broker credentials from the environment, never from source code.</p>`,
        },
        {
          type: "text",
          html: `<p>Choose by communication shape. Request and response with low latency: HTTP. Server push or chatty two-way traffic with a browser: WebSocket. Work that can happen later, must survive restarts or should be spread across many workers: a broker. The author's broader advice applies here too: start with the simplest transport that works and move up only when you need what the next one offers.</p>`,
        },
        {
          type: "realworld",
          items: [
            { org: "Kubernetes", title: "WebSocket for streaming", html: "Kubernetes has been moving the streaming behind <code>kubectl exec</code>, <code>attach</code> and <code>cp</code> from the older SPDY protocol to WebSockets, which proxies and load balancers handle more reliably." },
          ],
        },
      ],
    },
    {
      id: "interview",
      title: "Networking questions you should be ready for",
      kicker: "Interview angle",
      blocks: [
        {
          type: "text",
          html: `<p>Low-level networking questions test whether you understand what the transport guarantees and how Go maps those guarantees onto goroutines and interfaces. The best answers connect a property (byte stream, connectionless, full duplex) to a concrete consequence in code.</p>`,
        },
        {
          type: "callout",
          tone: "interview",
          html: `<ol>
<li><strong>TCP vs UDP</strong>: reliable ordered byte stream with a handshake, versus independent best-effort datagrams with preserved boundaries. Pick UDP for latency-sensitive or tiny request/response traffic, or when building your own reliability (QUIC).</li>
<li><strong>Why "byte stream" matters</strong>: you must frame messages with delimiters, length prefixes or a streaming encoder, and use <code>io.ReadFull</code>.</li>
<li><strong>Concurrent server</strong>: <code>Accept</code> in a loop, <code>go handle(c)</code>, <code>defer c.Close()</code>, read deadlines, and close the listener to stop.</li>
<li><strong>UDP without Accept</strong>: one socket, <code>ReadFrom</code> returns the sender, <code>WriteTo</code> replies; beware spoofing and amplification.</li>
<li><strong>WebSocket upgrade</strong>: HTTP GET with Upgrade, 101 reply, <code>Sec-WebSocket-Accept</code> as a protocol proof, masked client frames, and <code>CheckOrigin</code> against hijacking.</li>
<li><strong>Brokers</strong>: autoAck means at-most-once; manual acks plus idempotent consumers give at-least-once.</li>
</ol>`,
        },
        {
          type: "quiz",
          q: "Your WebSocket server authenticates users with a session cookie, and its Upgrader has CheckOrigin: func(*http.Request) bool { return true }. What is the risk?",
          options: [
            "None: browsers apply CORS to WebSocket handshakes",
            "Any website a logged-in user visits can open a socket to your server with their cookie and read the replies",
            "Clients can no longer send binary frames",
            "The server will reject connections from your own front end",
          ],
          answer: 1,
          explain: "Browsers attach cookies and an Origin header to WebSocket handshakes but don't block cross-origin sockets. The server must check Origin itself; returning true for every origin enables cross-site WebSocket hijacking.",
        },
      ],
    },
  ],
  takeaways: [
    "TCP is a reliable, ordered byte stream; UDP sends independent datagrams that may be lost but keep their boundaries.",
    "<code>net.Conn</code> is an <code>io.Reader</code> and <code>io.Writer</code>, so bufio, fmt and io work over sockets unchanged.",
    "A Go server is an <code>Accept</code> loop that starts one goroutine per connection, with <code>defer c.Close()</code> and read deadlines in each handler.",
    "Never assume one Read is one message on TCP: frame with delimiters, length prefixes or a streaming encoder, and read with <code>io.ReadFull</code>.",
    "A UDP server is one socket: <code>ReadFrom</code> tells you the sender and <code>WriteTo</code> replies, so per-client state and spoofing are your problem.",
    "WebSocket upgrades an HTTP request to a full-duplex framed connection; check <code>Origin</code>, and keep one reader and one writer per connection.",
    "A broker decouples producers and consumers in time; use durable queues and manual acks for at-least-once delivery.",
  ],
  furtherReading: [
    { title: "net package documentation", url: "https://pkg.go.dev/net", note: "Dial, Listen, ListenPacket, Dialer and the Conn interfaces." },
    { title: "RFC 6455: The WebSocket Protocol", url: "https://www.rfc-editor.org/rfc/rfc6455", note: "The handshake, framing and masking rules." },
    { title: "RabbitMQ Go client (amqp091-go)", url: "https://github.com/rabbitmq/amqp091-go", note: "The client library, with examples of publishing, consuming and acknowledgements." },
  ],
};
