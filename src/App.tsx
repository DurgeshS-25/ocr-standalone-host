import { useState, useEffect } from "react";
import { supabase } from "./supabaseClient";
import { processLabReportWithEdgeFunction } from "./ocrModule";

function App() {
  const [session, setSession] = useState<any>(null);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  
  // Auth form
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  
  // Upload form
  const [panelName, setPanelName] = useState("");
  const [collectionDate, setCollectionDate] = useState("");
  const [labProvider, setLabProvider] = useState("");
  const [file, setFile] = useState<File | null>(null);
  
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [biomarkers, setBiomarkers] = useState<any[]>([]);
  const [patientInfo, setPatientInfo] = useState<any>(null);
  const [uploadProgress, setUploadProgress] = useState("");

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setSession(session));
    return () => listener.subscription.unsubscribe();
  }, []);

  const handleSignup = async () => {
    if (!email || !password) {
      setError("Email and password are required");
      return;
    }
    if (authMode === "signup" && (!firstName || !lastName)) {
      setError("First name and last name are required");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    
    const { data, error: signupError } = await supabase.auth.signUp({ email, password });
    
    if (signupError) {
      setError(signupError.message);
      setLoading(false);
      return;
    }
    
    if (data.user) {
      const { error: profileError } = await supabase.from("profiles").insert({
        id: data.user.id,
        first_name: firstName,
        last_name: lastName,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      
      if (profileError) {
        console.error("Profile creation error:", profileError);
        setError("Account created but profile setup failed.");
      } else {
        setMessage("✅ Signup successful! Please check your email to verify.");
        setFirstName("");
        setLastName("");
        setEmail("");
        setPassword("");
      }
    }
    
    setLoading(false);
  };

  const handleLogin = async () => {
    if (!email || !password) {
      setError("Please enter email and password");
      return;
    }

    setLoading(true);
    setError("");
    setMessage("");
    
    const { error: loginError } = await supabase.auth.signInWithPassword({ email, password });
    
    if (loginError) {
      setError(loginError.message);
    }
    
    setLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setBiomarkers([]);
    setPatientInfo(null);
    setMessage("");
    setError("");
  };

  const handleProcess = async () => {
    if (!session?.user || !file) {
      setError("Please login and select a file first");
      return;
    }

    try {
      setLoading(true);
      setError("");
      setMessage("");
      setBiomarkers([]);
      setPatientInfo(null);

      setUploadProgress("📄 Converting PDF to image...");
      setUploadProgress("☁️ Processing with Edge Function...");
      
      const result = await processLabReportWithEdgeFunction(
        file,
        session.user.id,
        panelName,
        collectionDate,
        labProvider
      );

      setUploadProgress(`✅ Found ${result.biomarkers.length} biomarkers`);

      if (result.patient) {
        setPatientInfo(result.patient);
      }

      setBiomarkers(result.biomarkers);
      setMessage(`✅ Successfully processed ${result.biomarkers.length} biomarkers!`);
      setUploadProgress("");
      
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred");
      setUploadProgress("");
    } finally {
      setLoading(false);
    }
  };

  // Login/Signup Page
  if (!session) {
    return (
      <div style={styles.page}>
        <div style={styles.authContainer}>
          <div style={styles.authCard}>
            <h1 style={styles.title}>🧠 Lab Report Extractor</h1>
            <p style={styles.subtitle}>Vision API OCR Only</p>

            <div style={styles.tabs}>
              <button
                onClick={() => setAuthMode("login")}
                style={{
                  ...styles.tab,
                  ...(authMode === "login" ? styles.activeTab : styles.inactiveTab)
                }}
              >
                Login
              </button>
              <button
                onClick={() => setAuthMode("signup")}
                style={{
                  ...styles.tab,
                  ...(authMode === "signup" ? styles.activeTab : styles.inactiveTab)
                }}
              >
                Sign Up
              </button>
            </div>

            <div style={styles.form}>
              {authMode === "signup" && (
                <div style={styles.nameRow}>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>First Name *</label>
                    <input
                      style={styles.input}
                      placeholder="John"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                    />
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={styles.label}>Last Name *</label>
                    <input
                      style={styles.input}
                      placeholder="Doe"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <label style={styles.label}>Email *</label>
                <input
                  style={styles.input}
                  type="email"
                  placeholder="your@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div>
                <label style={styles.label}>Password *</label>
                <input
                  style={styles.input}
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>

              {authMode === "login" ? (
                <button
                  style={loading ? styles.btnDisabled : styles.btn}
                  onClick={handleLogin}
                  disabled={loading}
                >
                  {loading ? "Logging in..." : "Login"}
                </button>
              ) : (
                <button
                  style={loading ? styles.btnDisabled : styles.btn}
                  onClick={handleSignup}
                  disabled={loading}
                >
                  {loading ? "Creating account..." : "Create Account"}
                </button>
              )}
            </div>

            {error && <div style={styles.errorBox}>{error}</div>}
            {message && <div style={styles.successBox}>{message}</div>}
          </div>
        </div>
      </div>
    );
  }

  // Main App (After Login)
  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div>
          <h2 style={{ margin: 0, fontSize: "1.5rem" }}>Welcome, {session.user.email}</h2>
          <p style={{ margin: "0.25rem 0 0 0", color: "#888" }}>Vision API OCR Only</p>
        </div>
        <button onClick={handleLogout} style={styles.btnOutline}>
          Logout
        </button>
      </div>

      <div style={styles.card}>
        <h3 style={{ marginTop: 0 }}>Upload Lab Report</h3>
        
        <div style={styles.uploadForm}>
          <div>
            <label style={styles.label}>Panel Name</label>
            <input
              style={styles.input}
              placeholder="e.g., Complete Blood Count"
              value={panelName}
              onChange={(e) => setPanelName(e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label}>Collection Date</label>
            <input
              style={styles.input}
              type="date"
              value={collectionDate}
              onChange={(e) => setCollectionDate(e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label}>Lab Provider</label>
            <input
              style={styles.input}
              placeholder="e.g., Quest Diagnostics"
              value={labProvider}
              onChange={(e) => setLabProvider(e.target.value)}
            />
          </div>

          <div>
            <label style={styles.label}>Select PDF File</label>
            <input
              type="file"
              accept="application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] || null)}
              style={{ ...styles.input, padding: "0.75rem" }}
            />
            {file && <p style={{ color: "#888", fontSize: "0.85rem", marginTop: "0.25rem" }}>
              Selected: {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </p>}
          </div>

          <button 
            style={loading ? styles.btnDisabled : styles.btn} 
            onClick={handleProcess} 
            disabled={loading || !file}
          >
            {loading ? "⏳ Processing..." : "🚀 Upload & Analyze"}
          </button>

          {uploadProgress && (
            <div style={styles.progressBox}>
              {uploadProgress}
            </div>
          )}
        </div>

        {error && <div style={styles.errorBox}>{error}</div>}
        {message && <div style={styles.successBox}>{message}</div>}
      </div>

      {patientInfo && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>👤 Patient Information</h3>
          <div style={styles.patientGrid}>
            <div>
              <strong>Name:</strong> {patientInfo.firstName} {patientInfo.lastName}
            </div>
            <div>
              <strong>DOB:</strong> {patientInfo.dateOfBirth}
            </div>
            <div>
              <strong>Gender:</strong> {patientInfo.gender}
            </div>
          </div>
        </div>
      )}

      {biomarkers.length > 0 && (
        <div style={styles.card}>
          <h3 style={{ marginTop: 0 }}>🧪 Extracted Biomarkers ({biomarkers.length} tests)</h3>
          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Test Name</th>
                  <th style={styles.th}>Result</th>
                  <th style={styles.th}>Unit</th>
                  <th style={styles.th}>Reference Range</th>
                  <th style={styles.th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {biomarkers.map((b, i) => (
                  <tr key={i} style={styles.tr}>
                    <td style={styles.td}>{b.marker_name}</td>
                    <td style={{ ...styles.td, fontWeight: 600 }}>{b.value}</td>
                    <td style={styles.td}>{b.unit || '-'}</td>
                    <td style={styles.td}>
                      {b.reference_range_min && b.reference_range_max 
                        ? `${b.reference_range_min} - ${b.reference_range_max}`
                        : "-"}
                    </td>
                    <td style={styles.td}>
                      <span style={getStatusBadge(b.status)}>{b.status || "normal"}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

const getStatusBadge = (status: string) => ({
  padding: "0.25rem 0.75rem",
  borderRadius: "12px",
  fontSize: "0.8rem",
  fontWeight: 600,
  background: status === "high" || status === "low" || status === "critical" 
    ? "#fee" 
    : "#efe",
  color: status === "high" || status === "low" || status === "critical"
    ? "#c00"
    : "#060",
});

const styles = {
  page: {
    background: "#050816",
    color: "#fff",
    minHeight: "100vh",
    padding: "2rem",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },
  authContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    minHeight: "80vh",
  },
  authCard: {
    background: "#0b1020",
    padding: "2.5rem",
    borderRadius: "16px",
    border: "1px solid rgba(255,255,255,0.1)",
    maxWidth: "500px",
    width: "100%",
  },
  title: {
    fontSize: "2rem",
    marginBottom: "0.5rem",
    textAlign: "center" as const,
  },
  subtitle: {
    textAlign: "center" as const,
    color: "#888",
    marginBottom: "2rem",
  },
  tabs: {
    display: "flex",
    gap: "0.5rem",
    marginBottom: "2rem",
    background: "#050816",
    padding: "0.25rem",
    borderRadius: "8px",
  },
  tab: {
    flex: 1,
    padding: "0.75rem",
    border: "none",
    borderRadius: "6px",
    cursor: "pointer",
    fontSize: "0.95rem",
    fontWeight: 600,
  },
  activeTab: {
    background: "#007bff",
    color: "#fff",
  },
  inactiveTab: {
    background: "transparent",
    color: "#888",
  },
  form: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.25rem",
  },
  nameRow: {
    display: "flex",
    gap: "1rem",
  },
  label: {
    display: "block",
    marginBottom: "0.4rem",
    fontSize: "0.9rem",
    color: "#aaa",
    fontWeight: 500,
  },
  input: {
    width: "100%",
    padding: "0.75rem",
    borderRadius: "8px",
    border: "1px solid #444",
    background: "#050816",
    color: "#fff",
    fontSize: "0.95rem",
    boxSizing: "border-box" as const,
  },
  btn: {
    background: "#007bff",
    border: "none",
    borderRadius: "8px",
    padding: "0.875rem",
    color: "#fff",
    cursor: "pointer",
    fontWeight: 600,
    fontSize: "1rem",
  },
  btnDisabled: {
    background: "#555",
    border: "none",
    borderRadius: "8px",
    padding: "0.875rem",
    color: "#fff",
    cursor: "not-allowed",
    fontWeight: 600,
    fontSize: "1rem",
    opacity: 0.5,
  },
  btnOutline: {
    background: "transparent",
    border: "1px solid #007bff",
    borderRadius: "8px",
    padding: "0.5rem 1.25rem",
    color: "#007bff",
    cursor: "pointer",
    fontWeight: 600,
  },
  errorBox: {
    padding: "0.875rem",
    background: "#3a1a1a",
    border: "1px solid #5a2a2a",
    borderRadius: "8px",
    marginTop: "1rem",
    color: "#ff6b6b",
  },
  successBox: {
    padding: "0.875rem",
    background: "#1a3a1a",
    border: "1px solid #2a5a2a",
    borderRadius: "8px",
    marginTop: "1rem",
    color: "#90ee90",
  },
  progressBox: {
    padding: "0.875rem",
    background: "#1a2a3a",
    border: "1px solid #2a4a5a",
    borderRadius: "8px",
    marginTop: "1rem",
    color: "#aaa",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "2rem",
    padding: "1.5rem",
    background: "#0b1020",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  card: {
    background: "#0b1020",
    padding: "1.5rem",
    marginTop: "1.5rem",
    borderRadius: "12px",
    border: "1px solid rgba(255,255,255,0.1)",
  },
  uploadForm: {
    display: "flex",
    flexDirection: "column" as const,
    gap: "1.25rem",
  },
  patientGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
    gap: "1rem",
    padding: "1rem",
    background: "#050816",
    borderRadius: "8px",
    fontSize: "0.95rem",
  },
  tableContainer: {
    overflowX: "auto" as const,
    marginTop: "1rem",
  },
  table: {
    width: "100%",
    borderCollapse: "collapse" as const,
    fontSize: "0.9rem",
  },
  th: {
    padding: "0.75rem",
    textAlign: "left" as const,
    borderBottom: "2px solid #444",
    color: "#aaa",
    fontWeight: 600,
  },
  td: {
    padding: "0.75rem",
    borderBottom: "1px solid #333",
  },
  tr: {
    transition: "background 0.2s",
  },
};

export default App;