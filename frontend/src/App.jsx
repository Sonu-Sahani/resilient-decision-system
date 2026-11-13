import { useEffect, useMemo, useState } from "react";
import {
  Activity,
  CheckCircle2,
  Clock3,
  FileText,
  RefreshCw,
  ShieldCheck,
  Workflow,
  X,
  AlertTriangle,
} from "lucide-react";
import { api } from "./lib/api";
const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(n || 0);
const initialForm = {
  applicantName: "Aarav Sharma",
  email: "aarav@example.com",
  annualIncome: 900000,
  creditScore: 720,
  requestedAmount: 250000,
};
export default function App() {
  const [items, setItems] = useState([]);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(initialForm);
  const [selected, setSelected] = useState(null);
  async function load() {
    try {
      const [a, b] = await Promise.all([
        api.get("/requests"),
        api.get("/config"),
      ]);
      setItems(a.data.data);
      setConfig(b.data.data);
      setError("");
    } catch (e) {
      setError(
        e.response?.data?.message ||
          "Cannot connect to API. Start MongoDB and the backend.",
      );
    }
  }
  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);
  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const result = await api.post(
        "/requests",
        {
          ...form,
          annualIncome: Number(form.annualIncome),
          creditScore: Number(form.creditScore),
          requestedAmount: Number(form.requestedAmount),
        },
        { headers: { "Idempotency-Key": crypto.randomUUID() } },
      );
      setNotice(
        `Application evaluated: ${result.data.data.status.replaceAll("_", " ")}.`,
      );
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Submission failed.");
    } finally {
      setBusy(false);
    }
  }
  async function retry(id) {
    try {
      await api.post(`/requests/${id}/retry`);
      setNotice("Retry completed.");
      await load();
    } catch (e) {
      setError(e.response?.data?.message || "Retry failed.");
    }
  }
  const counts = useMemo(
    () => ({
      total: items.length,
      approved: items.filter((x) => x.status === "APPROVED").length,
      review: items.filter((x) => x.status === "MANUAL_REVIEW").length,
      pending: items.filter((x) =>
        ["PENDING", "PROCESSING", "RETRY_PENDING"].includes(x.status),
      ).length,
    }),
    [items],
  );
  return (
    <main className="shell">
      <header>
        <div className="brand">
          <div className="logo">
            <Workflow size={22} />
          </div>
          <div>
            <b>DecisionFlow</b>
            <small>RESILIENT WORKFLOW CONSOLE</small>
          </div>
        </div>
        <div className="live">
          <span /> SYSTEM OVERVIEW{" "}
          <button onClick={load} title="Refresh">
            <RefreshCw size={16} />
          </button>
        </div>
      </header>
      <section className="hero">
        <div>
          <p className="eyebrow">CONFIGURABLE DECISION PLATFORM</p>
          <h1>
            Make every decision
            <br />
            <em>traceable.</em>
          </h1>
          <p className="sub">
            A resilient workflow engine for application approvals, rule
            evaluation and auditable outcomes.
          </p>
        </div>
        <div className="hero-art">
          <div className="orbit o1" />
          <div className="orbit o2" />
          <div className="core">
            <ShieldCheck size={42} />
          </div>
          <span className="node n1">RULES</span>
          <span className="node n2">AUDIT</span>
          <span className="node n3">RETRY</span>
        </div>
      </section>
      {error && (
        <div className="error">
          <AlertTriangle size={17} /> {error}
        </div>
      )}
      {notice && <div className="notice">{notice}</div>}
      <section className="stats">
        <Stat icon={<FileText />} label="TOTAL REQUESTS" value={counts.total} />
        <Stat
          icon={<CheckCircle2 />}
          label="APPROVED"
          value={counts.approved}
        />
        <Stat icon={<Clock3 />} label="MANUAL REVIEW" value={counts.review} />
        <Stat icon={<Activity />} label="IN PROGRESS" value={counts.pending} />
      </section>
      <section className="grid">
        <div className="panel form-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">NEW WORKFLOW</p>
              <h2>Submit an application</h2>
            </div>
            <span className="tag">V{config?.version || 1} CONFIG</span>
          </div>
          <form onSubmit={submit}>
            <label>
              Applicant name
              <input
                required
                minLength="2"
                value={form.applicantName}
                onChange={(e) =>
                  setForm({ ...form, applicantName: e.target.value })
                }
              />
            </label>
            <label>
              Email address
              <input
                required
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </label>
            <div className="two">
              <label>
                Annual income (₹)
                <input
                  type="number"
                  min="1"
                  required
                  value={form.annualIncome}
                  onChange={(e) =>
                    setForm({ ...form, annualIncome: e.target.value })
                  }
                />
              </label>
              <label>
                Credit score
                <input
                  type="number"
                  min="300"
                  max="900"
                  required
                  value={form.creditScore}
                  onChange={(e) =>
                    setForm({ ...form, creditScore: e.target.value })
                  }
                />
              </label>
            </div>
            <label>
              Requested amount (₹)
              <input
                type="number"
                min="1"
                required
                value={form.requestedAmount}
                onChange={(e) =>
                  setForm({ ...form, requestedAmount: e.target.value })
                }
              />
            </label>
            <button className="primary" disabled={busy}>
              {busy ? "Processing…" : "Evaluate application"} <span>→</span>
            </button>
          </form>
          <p className="hint">
            Each submission uses a unique idempotency key. API retries with the
            same key return the original request.
          </p>
        </div>
        <div className="panel rules-panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">ACTIVE WORKFLOW</p>
              <h2>{config?.name || "Loading workflow"}</h2>
            </div>
            <span className="tag green">ACTIVE</span>
          </div>
          <p className="rule-desc">{config?.description}</p>
          <div className="rule-list">
            {(config?.rules || []).map((r) => (
              <div className="rule" key={r.id}>
                <span className="rule-dot" />
                <div>
                  <b>{r.id}</b>
                  <small>
                    {r.type === "expression"
                      ? r.expression
                      : `${r.field} ${r.operator || "is required"} ${r.value ?? ""}`}
                  </small>
                </div>
                <span className="rule-type">{r.onFail || "CHECK"}</span>
              </div>
            ))}
          </div>
          <div className="workflow-foot">
            <span>REQUIRED FIELDS</span>
            <b>{config?.requiredFields?.length || 0}</b>
            <span>RULES</span>
            <b>{config?.rules?.length || 0}</b>
          </div>
        </div>
      </section>
      <section className="panel table-panel">
        <div className="panel-head">
          <div>
            <p className="eyebrow">EXECUTION HISTORY</p>
            <h2>Recent applications</h2>
          </div>
          <button className="refresh" onClick={load}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>APPLICANT</th>
                <th>REQUESTED</th>
                <th>STATUS</th>
                <th>RETRIES</th>
                <th>CREATED</th>
                <th>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {items.map((x) => (
                <tr key={x._id}>
                  <td>
                    <b>{x.input?.applicantName || "Unknown"}</b>
                    <small>{x.input?.email}</small>
                  </td>
                  <td>{money(x.input?.requestedAmount)}</td>
                  <td>
                    <span className={`status ${x.status?.toLowerCase()}`}>
                      {x.status?.replaceAll("_", " ")}
                    </span>
                  </td>
                  <td>{x.retryCount}</td>
                  <td>{new Date(x.createdAt).toLocaleString()}</td>
                  <td>
                    {x.status === "RETRY_PENDING" && (
                      <button className="retry" onClick={() => retry(x._id)}>
                        Retry
                      </button>
                    )}{" "}
                    <button className="details" onClick={() => setSelected(x)}>
                      Details
                    </button>
                  </td>
                </tr>
              ))}
              {!items.length && (
                <tr>
                  <td colSpan="6" className="empty">
                    No applications yet. Submit one to start the workflow.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
      <footer>
        DECISIONFLOW <span>·</span> BUILT FOR RESILIENT OPERATIONS{" "}
        <span>·</span> API HEALTH CHECK: <b>/api/health</b>
      </footer>
      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <section className="audit-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-head">
              <div>
                <p className="eyebrow">REQUEST DETAILS</p>
                <h2>{selected.input?.applicantName || "Application"}</h2>
              </div>
              <button className="icon-button" onClick={() => setSelected(null)}>
                <X size={19} />
              </button>
            </div>
            <div className="decision-summary">
              <span className={`status ${selected.status?.toLowerCase()}`}>
                {selected.status?.replaceAll("_", " ")}
              </span>
              <b>{selected.decision || "Awaiting decision"}</b>
              <p>{selected.explanation}</p>
              <small>
                Workflow {selected.workflowId} · Version{" "}
                {selected.workflowVersion} · Retries {selected.retryCount}
              </small>
            </div>
            <h3>Rule evaluation</h3>
            {(selected.ruleTrace || []).map((r) => (
              <div className="trace-row" key={r.ruleId}>
                <span className={r.passed ? "pass-dot" : "fail-dot"} />{" "}
                <b>{r.ruleId}</b>
                <small>{r.message}</small>
              </div>
            ))}
            <h3>Audit trail</h3>
            <div className="audit-list">
              {(selected.audit || []).map((a, i) => (
                <div className="audit-event" key={`${a.at}-${i}`}>
                  <time>{new Date(a.at).toLocaleString()}</time>
                  <b>
                    {a.stage} · {a.action}
                  </b>
                  <p>{a.message}</p>
                </div>
              ))}
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
function Stat({ icon, label, value }) {
  return (
    <div className="stat">
      <div className="stat-icon">{icon}</div>
      <div>
        <small>{label}</small>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
