import { ReactNode, useEffect, useState } from "react";
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
          height: "90vh",
          gap: "1em",
        }}
      >
        <GitHubLink />
        <Title />
        <LengthenerInput setGenerated={setGenerated} />
        <Result result={generated} />
      </div>
      <TermsOfUse />
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
        display: "flex",
        flexDirection: "column",
        alignItems: "flex-end",
        gap: "0.5em",
      }}
    >
      <div
        style={{
          fontSize: "1em",
          width: "25ch",
          lineBreak: "anywhere",
          textAlign: "right",
        }}
      >
        {result || "c".repeat(300)}
      </div>
      <button
        style={{ width: "8ch" }}
        onClick={() => navigator.clipboard.writeText(result)}
      >
        Copy
      </button>
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
      <h1
        style={{
          color: "#00000000",
          position: "absolute",
          fontSize: "3em",
          width: "8ch",
          lineBreak: "anywhere",
          textAlign: "right",
          fontWeight: "normal",
        }}
      >
        {cRaw.slice(0, 40)}.{cRaw.slice(40)}
      </h1>
      <h1
        style={{
          pointerEvents: "none",
          userSelect: "none",
          fontSize: "3em",
          width: "8ch",
          lineBreak: "anywhere",
          textAlign: "right",
          fontWeight: "normal",
        }}
      >
        {c.slice(0, 40)}.{c.slice(40)}
      </h1>
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
          !["http:", "https:"].includes(url.protocol)
        ) {
          throw new Error("Invalid");
        }
      } catch {
        throw new Error("Invalid URL");
      }
      url.host = url.host.toLowerCase();
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
      <div
        style={{
          display: "flex",
          gap: "1em",
          maxWidth: "100vw",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        <div style={{ alignItems: "center", maxWidth: "90%" }}>
          <input
            value={val}
            onChange={(event) => {
              setErr("");
              setVal(event.target.value);
            }}
            style={{
              fontSize: "1.5em",
              width: "30ch",
              maxWidth: "100%",
            }}
            placeholder="Paste a URL"
          />
          {err ? (
            <div>{err}</div>
          ) : (
            <div
              style={{ pointerEvents: "none", userSelect: "none", opacity: 0 }}
            >
              no_error
            </div>
          )}
        </div>
        <button
          onClick={() => {
            setGenerated("");
            setErr("");
            generateMutator.mutate(val, {
              onSuccess: (data) => {
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
            width: "12ch",
            padding: 0,
          }}
        >
          Generate
        </button>
      </div>
    </div>
  );
}

function GitHubLink() {
  return (
    <ShareLink
      text="View on GitHub"
      url="https://github.com/Ted-Barrett/lengthy"
      icon={
        <svg width="2em" viewBox="0 0 98 96" xmlns="http://www.w3.org/2000/svg">
          <path
            fill-rule="evenodd"
            clip-rule="evenodd"
            d="M48.854 0C21.839 0 0 22 0 49.217c0 21.756 13.993 40.172 33.405 46.69 2.427.49 3.316-1.059 3.316-2.362 0-1.141-.08-5.052-.08-9.127-13.59 2.934-16.42-5.867-16.42-5.867-2.184-5.704-5.42-7.17-5.42-7.17-4.448-3.015.324-3.015.324-3.015 4.934.326 7.523 5.052 7.523 5.052 4.367 7.496 11.404 5.378 14.235 4.074.404-3.178 1.699-5.378 3.074-6.6-10.839-1.141-22.243-5.378-22.243-24.283 0-5.378 1.94-9.778 5.014-13.2-.485-1.222-2.184-6.275.486-13.038 0 0 4.125-1.304 13.426 5.052a46.97 46.97 0 0 1 12.214-1.63c4.125 0 8.33.571 12.213 1.63 9.302-6.356 13.427-5.052 13.427-5.052 2.67 6.763.97 11.816.485 13.038 3.155 3.422 5.015 7.822 5.015 13.2 0 18.905-11.404 23.06-22.324 24.283 1.78 1.548 3.316 4.481 3.316 9.126 0 6.6-.08 11.897-.08 13.526 0 1.304.89 2.853 3.316 2.364 19.412-6.52 33.405-24.935 33.405-46.691C97.707 22 75.788 0 48.854 0z"
            fill="var(--github)"
          />
        </svg>
      }
    />
  );
}

function TermsOfUse() {
  const [visible, setVisible] = useState(false);
  return (
    <>
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 0,
          width: "100vw",
          textAlign: "center",
          paddingBottom: "10px",
        }}
      >
        {!visible && (
          <div
            style={{
              opacity: 0.6,
              transform: "translate",
            }}
            onClick={() => setVisible(true)}
          >
            By using this website, you agree to the{" "}
            <span style={{ textDecoration: "underline" }}>terms of use</span>
          </div>
        )}
      </div>
      {visible && (
        <>
          <div
            style={{
              top: 0,
              left: 0,
              position: "absolute",
              width: "100vw",
              height: "90vh",
              background: "var(--bg)",
            }}
          />
          <div
            style={{
              top: 0,
              left: 0,
              position: "absolute",
              transform: "translate(50px, 50px)",
              width: "calc(100vw - 100px)",
              height: "70vh",
              background: "var(--bg)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: "1em",
              padding: "50px",
            }}
          >
            <h2>Terms of use</h2>
            <div>
              "The Service" (including this website and all associated
              infrastructure) is provided under the following terms:
            </div>
            <div>
              <div>
                1. By using the service, you agree that you are solely
                responsible for any URLs you create or share.
              </div>
              <div>
                2. The service is provided "as is" without any warranties or
                guarantees of availability, accuracy, or security.
              </div>
              <div>
                3. You must not use the service for illegal, harmful, or
                malicious purposes.
              </div>
              <div>
                4. The service owner is not liable for any damages or issues
                arising from the use of this service.
              </div>
              <div>
                5. These terms may be updated at any time without notice.
              </div>
            </div>
            <button style={{ width: "9ch" }} onClick={() => setVisible(false)}>
              Close
            </button>
          </div>
        </>
      )}
    </>
  );
}

function ShareLink({
  text,
  url,
  icon,
}: {
  text: string;
  url: string;
  icon: ReactNode;
}) {
  return (
    <a
      href={url}
      className="link"
      target="_blank"
      rel="noreferrer"
      style={{
        fontSize: "1em",
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        gap: "0.5em",
        border: "1px solid var(--fg)",
        padding: "0.5em",
      }}
    >
      <div>{text}</div>
      <div>{icon}</div>
    </a>
  );
}

function shuffleCase(s: string, p: number) {
  return [...s]
    .map((x) =>
      Math.random() < p
        ? x === x.toUpperCase()
          ? x.toLowerCase()
          : x.toUpperCase()
        : x,
    )
    .join("");
}

export default App;
