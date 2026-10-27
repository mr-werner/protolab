import { TEMPLATES } from "../templates.js";
import { BUILD_VOLUME } from "../config.js";
import "./landing.css";

const STEPS = [
  ["01", "Start somewhere", "Pick a template, drop in your own .step, .stl or .3mf file, or start from an empty plate."],
  ["02", "Make it yours", "Add shapes and 3D text, type exact sizes in millimeters, and turn any shape into a hole to cut it out."],
  ["03", "Check and send", "The build area is drawn around your design and turns red if it won't fit. Save a .stp file for printing."],
];

const FEATURES = [
  ["Real CAD, in the browser", "Shapes are true solids built by the OpenCascade engine, so the .stp file you save opens in any CAD program."],
  ["Bring your own file", "Import a .step to keep editing it as a solid, or an .stl or .3mf from a model site to resize, combine and cut."],
  ["Build limits built in", `Your design has to fit a ${BUILD_VOLUME.x} × ${BUILD_VOLUME.y} × ${BUILD_VOLUME.z} mm build area. ProtoLab tells you when it doesn't.`],
  ["Holes and combining", "Any shape can be a hole. Holes cut through whatever they touch, and everything else joins into one part."],
  ["Thin wall warnings", "Parts thinner than 1.2 mm get flagged before you save, so there are no surprises at the printer."],
  ["Nothing to install", "No account and no download. Your design autosaves in your browser, and you can save it as a file to open later."],
];

const FAQ = [
  ["What files can I import?", "STEP (.step or .stp), STL and 3MF. STEP files stay fully editable. STL and 3MF files are meshes, so you can move, scale, rotate, combine and cut them, and those designs save as .stl."],
  ["What file do I get?", "A .stp (STEP) file, the standard CAD format for manufacturing. You can also save an .stl for slicers, or a ProtoLab design file to keep editing later."],
  ["How big can a print be?", `Up to ${BUILD_VOLUME.x} × ${BUILD_VOLUME.y} × ${BUILD_VOLUME.z} mm. Bigger ideas can be split into parts that fit.`],
  ["How do I order a print?", "Online checkout is coming soon. For now, the builder shows a price estimate and saves your file so it's ready to send."],
  ["Does it work on my phone?", "Yes, though a laptop or desktop with a mouse is easier for detailed work."],
];

function Mark() {
  return <span className="l-mark" aria-hidden="true" />;
}

export default function Landing() {
  const featured = TEMPLATES.slice(0, 9);
  return (
    <div className="landing">
      <header className="l-nav">
        <a href="/" className="l-brand">
          <Mark />
          ProtoLab
        </a>
        <nav aria-label="Main">
          <a href="#how">How it works</a>
          <a href="#templates">Templates</a>
          <a href="#faq">FAQ</a>
        </nav>
        <a className="l-btn small" href="/build">
          Open the builder
        </a>
      </header>

      <section className="l-hero">
        <div className="l-hero-copy">
          <p className="l-eyebrow">3D builder · runs in your browser</p>
          <h1>
            Design it here.
            <br />
            <span>We print it.</span>
          </h1>
          <p className="l-lede">
            ProtoLab is a simple CAD tool for custom 3D prints. Start from a template or your own file, make it yours, and see right away whether it fits the printer.
          </p>
          <div className="l-ctas">
            <a className="l-btn" href="/build">
              Start building
            </a>
            <a className="l-btn ghost" href="#templates">
              Browse templates
            </a>
          </div>
          <ul className="l-facts">
            <li>No account</li>
            <li>.step · .stl · .3mf in</li>
            <li>.stp out</li>
          </ul>
        </div>
        <a className="l-plate" href="/build?template=keychain" aria-label="Open the name keychain template">
          <div className="l-plate-head">
            <span>name-keychain.stp</span>
            <span className="ok">● Fits the printer</span>
          </div>
          <img src="/templates/keychain.png" alt="A name keychain with raised letters, shown on the build plate" />
          <div className="l-dims">
            <span>W 64.0</span>
            <span>D 22.0</span>
            <span>H 5.0 mm</span>
          </div>
          <div className="l-layers" aria-hidden="true">
            {Array.from({ length: 9 }, (_, i) => (
              <i key={i} style={{ animationDelay: `${i * 0.12}s` }} />
            ))}
          </div>
        </a>
      </section>

      <section className="l-section" id="how">
        <div className="l-head">
          <p className="l-eyebrow">How it works</p>
          <h2>From idea to print file in three steps</h2>
        </div>
        <ol className="l-steps">
          {STEPS.map(([n, title, body]) => (
            <li key={n}>
              <span className="l-step-n">{n}</span>
              <h3>{title}</h3>
              <p>{body}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="l-section paper" id="templates">
        <div className="l-head">
          <p className="l-eyebrow">Templates</p>
          <h2>Not sure what to make? Start from one of these.</h2>
          <p>Every template is made of simple shapes you can change: the text, the size, the holes, all of it.</p>
        </div>
        <div className="l-tpl-grid">
          {featured.map((t) => (
            <a key={t.id} className="l-tpl" href={`/build?template=${t.id}`}>
              <img src={`/templates/${t.id}.png`} alt="" loading="lazy" />
              <div>
                <h3>{t.name}</h3>
                <p>{t.blurb}</p>
              </div>
              <span className="l-tpl-go" aria-hidden="true">
                Open →
              </span>
            </a>
          ))}
        </div>
      </section>

      <section className="l-section" id="features">
        <div className="l-head">
          <p className="l-eyebrow">The builder</p>
          <h2>Simple enough for a first print, accurate enough for a real part</h2>
        </div>
        <div className="l-features">
          {FEATURES.map(([title, body]) => (
            <div key={title} className="l-feature">
              <h3>{title}</h3>
              <p>{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="l-section paper" id="faq">
        <div className="l-head">
          <p className="l-eyebrow">FAQ</p>
          <h2>Questions</h2>
        </div>
        <div className="l-faq">
          {FAQ.map(([q, a]) => (
            <details key={q}>
              <summary>{q}</summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="l-close">
        <h2>Got an idea? Put it on the plate.</h2>
        <a className="l-btn" href="/build">
          Open the builder
        </a>
      </section>

      <footer className="l-foot">
        <a href="/" className="l-brand small">
          <Mark />
          ProtoLab
        </a>
        <span>© {new Date().getFullYear()} ProtoLab</span>
      </footer>
    </div>
  );
}
