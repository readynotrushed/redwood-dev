const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PATCH, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const CHAT_DB_ID = "330e185a4dda80fc8fd8e6ef83f73b0b";

export default {
  async fetch(request, env) {
    const notionKey = env.NOTION_API_KEY;
    const dbId = env.NOTION_DATABASE_ID;

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // POST /session — teacher submits a session
    if (request.method === "POST" && url.pathname === "/session") {
      const body = await request.json();
      const { date, time, teacher, activity, zoom_link } = body;

      if (!date || !time || !teacher || !zoom_link) {
        return new Response(JSON.stringify({ error: "Missing required fields" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const notion_payload = {
        parent: { database_id: dbId },
        properties: {
          Date: { date: { start: date } },
          Time: { rich_text: [{ text: { content: time } }] },
          Teacher: { title: [{ text: { content: teacher } }] },
          Activity: { rich_text: [{ text: { content: activity || "" } }] },
          "Zoom Link": { url: zoom_link },
          "Submitted At": { date: { start: new Date().toISOString() } },
        },
      };

      const notion_res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(notion_payload),
      });

      if (!notion_res.ok) {
        const err = await notion_res.text();
        return new Response(JSON.stringify({ error: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // GET /sessions — fetch all sessions (for parent view and teacher view)
    if (request.method === "GET" && url.pathname === "/sessions") {
      const notion_res = await fetch(
        `https://api.notion.com/v1/databases/${dbId}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${notionKey}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({
            sorts: [
              { property: "Date", direction: "ascending" },
              { property: "Time", direction: "ascending" },
            ],
          }),
        }
      );

      if (!notion_res.ok) {
        const err = await notion_res.text();
        return new Response(JSON.stringify({ error: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const data = await notion_res.json();

      const sessions = data.results.map((page) => ({
        id: page.id,
        date: page.properties.Date?.date?.start || "",
        time: page.properties.Time?.rich_text?.[0]?.plain_text || "",
        teacher: page.properties.Teacher?.title?.[0]?.plain_text || "",
        activity: page.properties.Activity?.rich_text?.[0]?.plain_text || "",
        zoom_link: page.properties["Zoom Link"]?.url || "",
      }));

      return new Response(JSON.stringify(sessions), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // PATCH /session/:id — teacher edits a session
    if (request.method === "PATCH" && url.pathname.startsWith("/session/")) {
      const pageId = url.pathname.split("/session/")[1];
      const body = await request.json();
      const { date, time, teacher, activity, zoom_link } = body;

      const notion_payload = {
        properties: {
          Date: { date: { start: date } },
          Time: { rich_text: [{ text: { content: time } }] },
          Teacher: { title: [{ text: { content: teacher } }] },
          Activity: { rich_text: [{ text: { content: activity || "" } }] },
          "Zoom Link": { url: zoom_link },
        },
      };

      const notion_res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${notionKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(notion_payload),
      });

      if (!notion_res.ok) {
        const err = await notion_res.text();
        return new Response(JSON.stringify({ error: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // DELETE /session/:id — teacher cancels a session
    if (request.method === "DELETE" && url.pathname.startsWith("/session/")) {
      const pageId = url.pathname.split("/session/")[1];

      const notion_res = await fetch(
        `https://api.notion.com/v1/pages/${pageId}`,
        {
          method: "PATCH",
          headers: {
            Authorization: `Bearer ${notionKey}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({ archived: true }),
        }
      );

      if (!notion_res.ok) {
        const err = await notion_res.text();
        return new Response(JSON.stringify({ error: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // GET /chat/:sessionId — fetch messages for a specific session
    if (request.method === "GET" && url.pathname.startsWith("/chat/")) {
      const sessionId = url.pathname.split("/chat/")[1];

      const notion_res = await fetch(
        `https://api.notion.com/v1/databases/${CHAT_DB_ID}/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${notionKey}`,
            "Content-Type": "application/json",
            "Notion-Version": "2022-06-28",
          },
          body: JSON.stringify({
            filter: {
              property: "Session ID",
              rich_text: { equals: sessionId },
            },
            sorts: [{ property: "Sent At", direction: "ascending" }],
            page_size: 100,
          }),
        }
      );

      if (!notion_res.ok) {
        const err = await notion_res.text();
        return new Response(JSON.stringify({ error: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const data = await notion_res.json();
      const messages = data.results.map((page) => ({
        id: page.id,
        username: page.properties.Username?.title?.[0]?.plain_text || "",
        message: page.properties.Message?.rich_text?.[0]?.plain_text || "",
        sent_at: page.properties["Sent At"]?.date?.start || "",
      }));

      return new Response(JSON.stringify(messages), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // POST /chat/:sessionId — send a message for a specific session
    if (request.method === "POST" && url.pathname.startsWith("/chat/")) {
      const sessionId = url.pathname.split("/chat/")[1];
      const body = await request.json();
      const { username, message } = body;

      if (!username || !message) {
        return new Response(JSON.stringify({ error: "Missing username or message" }), {
          status: 400,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      const notion_payload = {
        parent: { database_id: CHAT_DB_ID },
        properties: {
          Username: { title: [{ text: { content: username } }] },
          Message: { rich_text: [{ text: { content: message } }] },
          "Session ID": { rich_text: [{ text: { content: sessionId } }] },
          "Sent At": { date: { start: new Date().toISOString() } },
        },
      };

      const notion_res = await fetch("https://api.notion.com/v1/pages", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${notionKey}`,
          "Content-Type": "application/json",
          "Notion-Version": "2022-06-28",
        },
        body: JSON.stringify(notion_payload),
      });

      if (!notion_res.ok) {
        const err = await notion_res.text();
        return new Response(JSON.stringify({ error: err }), {
          status: 500,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    return new Response("Not found", { status: 404, headers: CORS_HEADERS });
  },
};
