import { useEffect, useState } from "react";
import "./App.css";
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
} from "@tanstack/react-query";

function App() {
  const [generated, setGenerated] = useState("");
  return (
    <QueryClientProvider client={new QueryClient()}>
      <div
        style={{
          fontFamily: "monospace",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          gap: "1em",
        }}
      >
        <Title />
        <LengthenerInput setGenerated={setGenerated} />
        <Result result={generated} />
      </div>
    </QueryClientProvider>
  );
}

function Result({ result }: { result: string }) {
  return (
    <div
      style={{
        opacity: result ? 1 : 0,
        pointerEvents: result ? undefined : "none",
        userSelect: result ? undefined : "none",
        fontSize: "1em",
        width: "25ch",
        lineBreak: "anywhere",
        textAlign: "right",
      }}
    >
      {result || "c".repeat(300)}
    </div>
  );
}

function Title() {
  const [cRaw] = useState(shuffleCase("c".repeat(42), 0.5));
  const [c, setC] = useState(cRaw);

  useEffect(() => {
    const interval = setInterval(() => setC(shuffleCase(c, 0.2)), 1000);
    return () => {
      clearInterval(interval);
    };
  }, []);

  return (
    <div>
      <div
        style={{
          color: "#00000000",
          position: "absolute",
          fontSize: "3em",
          width: "8ch",
          lineBreak: "anywhere",
          textAlign: "right",
        }}
      >
        {cRaw.slice(0, 40)}.{cRaw.slice(40)}
      </div>
      <div
        style={{
          pointerEvents: "none",
          userSelect: "none",
          fontSize: "3em",
          width: "8ch",
          lineBreak: "anywhere",
          textAlign: "right",
        }}
      >
        {c.slice(0, 40)}.{c.slice(40)}
      </div>
    </div>
  );
}

function useGenerate() {
  return useMutation({
    mutationFn: async (val: string) => {
      let url: URL;
      try {
        if (!URL.canParse(val)) {
          url = new URL(`https://${val}`);
        } else {
          url = new URL(val);
        }
        if (
          !url.host.includes(".") ||
          url.host.lastIndexOf(".") === url.host.length - 1 ||
          !["http", "https"].includes(url.protocol)
        ) {
          throw new Error("Invalid");
        }
      } catch {
        throw new Error("Invalid URL");
      }
      const result = await (
        await fetch(`/api/generate/${encodeURIComponent(url.toString())}`)
      ).text();
      if (result.length !== 300) {
        throw new Error("Oops... something broke");
      }
      return result;
    },
  });
}

function LengthenerInput({
  setGenerated,
}: {
  setGenerated: (x: string) => void;
}) {
  const generateMutator = useGenerate();

  const [val, setVal] = useState("");

  const [err, setErr] = useState("");

  return (
    <div>
      <div style={{ display: "flex", gap: "1em" }}>
        <input
          value={val}
          onChange={(event) => {
            setErr("");
            setVal(event.target.value);
          }}
          style={{
            fontSize: "1.5em",
            width: "30ch",
          }}
          placeholder="Paste a URL"
        />
        <button
          onClick={() => {
            generateMutator.mutate(val, {
              onSuccess: (data) => {
                console.log(data);
                setGenerated(data);
              },
              onError: (err) => {
                setErr(String(err.message));
              },
            });
          }}
          className={generateMutator.isPending ? "loading" : undefined}
          style={{
            pointerEvents: generateMutator.isPending ? "none" : undefined,
            height: "100%",
            width: "6ch",
            padding: 0,
          }}
        >
          Go
        </button>
      </div>
      {err ? (
        <div>{err}</div>
      ) : (
        <div style={{ pointerEvents: "none", userSelect: "none", opacity: 0 }}>
          no_error
        </div>
      )}
    </div>
  );
}

function shuffleCase(s: string, p: number) {
  return [...s]
    .map((x) =>
      Math.random() < p
        ? x === x.toUpperCase()
          ? x.toLowerCase()
          : x.toUpperCase()
        : x
    )
    .join("");
}

export default App;
