import React from "react";
import ChatWidget from "@/app/components/ChatWidget";
import OpenChatButton from "@/app/components/OpenChatButton";

// Presentation-level identity configuration (UI only, decoupled from retrieval)
const PROFILE = {
  name: "Afnan PK",
  headline: "Agentic AI Engineer",
  location: "Dubai, UAE",
  positioning:
    "Building production multi-agent systems, grounded RAG architectures, and LLM-powered applications with measurable impact on latency, cost, and reliability.",
  links: {
    email: "mailto:afnaan.codes@gmail.com",
    linkedin: "https://linkedin.com/in/afnan-pk",
    github: "https://github.com/afnaann",
    portfolio: "https://afnaann.vercel.app",
  },
};

const EXPERIENCES = [
  {
    role: "Agentic AI Engineer",
    company: "Wiral AI · Doha, Qatar",
    period: "07/2025 – 08/2026",
    description:
      "Sole AI/LangGraph engineer on a production multi-tenant customer engagement platform handling ~400–600 daily interactions across WhatsApp, email, web chat, and voice.",
    highlights: [
      "Redesigned single-agent architecture into a LangGraph multi-agent system (Enquiry, Booking, Back Office) with conditional routing and handoff.",
      "Reduced user-facing response latency by ~30% via async back-office processing.",
      "Engineered hybrid RAG pipeline with Qdrant and tenant-level data isolation.",
      "Reduced LLM costs by 40–50% through semantic caching and cost-aware model routing.",
    ],
  },
  {
    role: "AI Full Stack Engineer",
    company: "WebMavericks Softcoders",
    period: "01/2025 – 07/2025",
    description:
      "Built 50+ Apache Airflow ETL pipelines integrating data from social media, e-commerce, and support platforms into AWS S3 and Redshift.",
    highlights: [
      "Optimized a Django-based QR logistics system, reducing checkpoint processing from ~12s to under 3s.",
      "Developed REST APIs with role-based access control in Django/PostgreSQL.",
    ],
  },
  {
    role: "Full Stack Developer",
    company: "Bridgeon Solutions",
    period: "03/2024 – 01/2025",
    description:
      "Co-architected a six-service microservices e-commerce platform with RabbitMQ for inter-service communication.",
    highlights: [
      "Integrated third-party APIs for cross-service workflows.",
      "Built CI/CD workflows with automated testing and release automation.",
    ],
  },
];

const PROJECTS = [
  {
    title: "Wiral AI — Multi-Agent Platform",
    tag: "Production · LangGraph · Multi-Agent",
    description:
      "Multi-tenant AI customer engagement platform with LangGraph orchestration, hybrid RAG retrieval (Qdrant), Redis distributed locking, semantic caching, and MCP/Zoho CRM integration.",
    stack: ["LangGraph", "Node.js", "Qdrant", "BullMQ", "Redis", "OpenAI"],
  },
  {
    title: "Enterprise ETL Pipeline",
    tag: "Data Engineering · AWS · Airflow",
    description:
      "50+ Apache Airflow ETL pipelines processing data from Facebook, TikTok, Google Ads, e-commerce, and support platforms into AWS S3 and Redshift with LLM-assisted data cleaning.",
    stack: ["Python", "Airflow", "AWS S3", "Redshift", "Docker", "PostgreSQL"],
  },
];

const SKILLS = [
  {
    category: "AI & LLM Engineering",
    items: [
      "LangGraph",
      "LangChain",
      "OpenAI API",
      "RAG",
      "Multi-Agent Systems",
      "MCP",
      "Prompt Engineering",
      "LLM Evaluation",
      "Semantic Caching",
    ],
  },
  {
    category: "Backend & Systems",
    items: [
      "Python",
      "Node.js",
      "Django",
      "Express.js",
      "Redis",
      "BullMQ",
      "Celery",
      "REST APIs",
      "Webhooks",
    ],
  },
  {
    category: "Data & Cloud",
    items: [
      "Apache Airflow",
      "PostgreSQL",
      "MongoDB",
      "Qdrant",
      "AWS (S3, Redshift)",
      "Azure",
      "Docker",
      "CI/CD",
    ],
  },
  {
    category: "Frontend",
    items: [
      "React",
      "Next.js",
      "TypeScript",
      "Redux Toolkit",
      "Tailwind CSS",
    ],
  },
];

export default function HomePage() {
  return (
    <>
      {/* Top Navigation */}
      <header className="site-nav">
        <div className="container site-nav-inner">
          <div className="nav-brand">
            <span>{PROFILE.name}</span>
            <span className="nav-status-badge">
              <span className="nav-status-dot" aria-hidden="true" />
              {PROFILE.location}
            </span>
          </div>

          <nav aria-label="Main Navigation">
            <ul className="nav-links">
              <li>
                <a href="#about" className="nav-link">
                  About
                </a>
              </li>
              <li>
                <a href="#experience" className="nav-link">
                  Experience
                </a>
              </li>
              <li>
                <a href="#projects" className="nav-link">
                  Projects
                </a>
              </li>
              <li>
                <a href="#skills" className="nav-link">
                  Skills
                </a>
              </li>
              <li>
                <a href="#contact" className="nav-link">
                  Contact
                </a>
              </li>
            </ul>
          </nav>

          <OpenChatButton className="nav-cta-button" id="nav-open-chat-btn">
            <span>Talk to Assistant</span>
            <span aria-hidden="true">→</span>
          </OpenChatButton>
        </div>
      </header>

      <main>
        {/* 1. Hero Section */}
        <section className="section hero-section" id="hero">
          <div className="container">
            <div className="hero-content">
              <div className="hero-meta-badge">
                <span>{PROFILE.headline}</span> • {PROFILE.location}
              </div>
              <h1 className="hero-title">{PROFILE.name}</h1>
              <p className="hero-subtitle">{PROFILE.headline}</p>
              <p className="hero-statement">{PROFILE.positioning}</p>
              <div className="hero-actions">
                <OpenChatButton className="btn-primary" id="hero-talk-btn">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                  <span>Talk to Afnan (AI Assistant)</span>
                </OpenChatButton>
                <a href="#projects" className="btn-secondary">
                  <span>View Projects</span>
                </a>
              </div>
            </div>
          </div>
        </section>

        {/* 2. About / Summary */}
        <section className="section" id="about">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Summary</span>
              <h2 className="section-title">About Me</h2>
              <p className="section-desc">
                Focusing on practical AI engineering: turning language models into dependable,
                grounded, and testable production software.
              </p>
            </div>
            <div className="about-grid">
              <div className="about-card">
                <h3>Autonomous Agent Systems</h3>
                <p>
                  Specialized in architecting autonomous agents that decompose complex problems,
                  interact with external environments safely, and execute structured operations with
                  resilient failure recovery.
                </p>
              </div>
              <div className="about-card">
                <h3>Grounded Retrieval &amp; Safety</h3>
                <p>
                  Dedicated to eliminating hallucinations through rigorous evidence-gating,
                  semantic chunking, and deterministic guardrails. If knowledge is absent, the
                  system refuses cleanly.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* 3. Experience */}
        <section className="section" id="experience">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Career History</span>
              <h2 className="section-title">Professional Experience</h2>
              <p className="section-desc">
                Engineering AI platforms with high reliability, strict evidence grounding, and low
                latency.
              </p>
            </div>
            <div className="experience-list">
              {EXPERIENCES.map((exp, idx) => (
                <article key={idx} className="experience-item">
                  <div className="exp-header">
                    <h3 className="exp-role">{exp.role}</h3>
                    <span className="exp-period">{exp.period}</span>
                  </div>
                  <div className="exp-company">{exp.company}</div>
                  <p className="exp-desc">{exp.description}</p>
                  <ul className="exp-highlights">
                    {exp.highlights.map((item, hIdx) => (
                      <li key={hIdx}>{item}</li>
                    ))}
                  </ul>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* 4. Projects */}
        <section className="section" id="projects">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Featured Work</span>
              <h2 className="section-title">Engineering Projects</h2>
              <p className="section-desc">
                Demonstrated architectures across retrieval systems, multi-agent frameworks, and
                vector indexing.
              </p>
            </div>
            <div className="projects-grid">
              {PROJECTS.map((proj, idx) => (
                <div key={idx} className="project-card">
                  <div>
                    <span className="project-tag">{proj.tag}</span>
                    <h3 className="project-name">{proj.title}</h3>
                    <p className="project-desc">{proj.description}</p>
                  </div>
                  <div className="project-stack">
                    {proj.stack.map((stk, sIdx) => (
                      <span key={sIdx} className="stack-badge">
                        {stk}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 5. Skills */}
        <section className="section" id="skills">
          <div className="container">
            <div className="section-header">
              <span className="section-tag">Competencies</span>
              <h2 className="section-title">Technical Skills</h2>
              <p className="section-desc">
                Core technologies and engineering proficiencies applied in production.
              </p>
            </div>
            <div className="skills-grid">
              {SKILLS.map((skillGroup, idx) => (
                <div key={idx} className="skill-category-card">
                  <h3 className="skill-category-title">{skillGroup.category}</h3>
                  <div className="skill-pills">
                    {skillGroup.items.map((item, iIdx) => (
                      <span key={iIdx} className="skill-pill">
                        {item}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 6. Contact */}
        <section className="section" id="contact">
          <div className="container">
            <div className="contact-card">
              <span className="section-tag">Get in Touch</span>
              <h3>Connect with {PROFILE.name}</h3>
              <p>
                Interested in building robust agentic systems or discussing applied AI engineering?
                Reach out directly or ask the document-grounded assistant.
              </p>
              <div className="contact-links">
                <a
                  href={PROFILE.links.email}
                  className="contact-link-btn"
                  rel="noopener noreferrer"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <span>Email</span>
                </a>
                <a
                  href={PROFILE.links.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-link-btn"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4v-7a6 6 0 0 1 6-6z" />
                    <rect x="2" y="9" width="4" height="12" />
                    <circle cx="4" cy="4" r="2" />
                  </svg>
                  <span>LinkedIn</span>
                </a>
                <a
                  href={PROFILE.links.github}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-link-btn"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
                  </svg>
                  <span>GitHub</span>
                </a>
                <a
                  href={PROFILE.links.portfolio}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="contact-link-btn"
                >
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                  </svg>
                  <span>Portfolio</span>
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="site-footer">
        <div className="container">
          <p>
            &copy; {new Date().getFullYear()} {PROFILE.name} • {PROFILE.headline}
          </p>
          <p>
            Built with Next.js App Router, Gemini Embeddings &amp; Groq LLM. Document-grounded RAG.
          </p>
        </div>
      </footer>

      {/* Integrated Document-Grounded Chat Widget */}
      <ChatWidget />
    </>
  );
}
