import { Link } from "react-router-dom";
// toolr-design-ignore-next-line
import { ArrowLeft } from "lucide-react";

export function Privacy() {
  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-subtext hover:text-text transition-colors text-sm mb-6"
      >
        <ArrowLeft className="w-4 h-4" />
        Back
      </Link>

      <h1 className="text-lg font-bold text-text mb-6">Privacy Policy</h1>

      <div className="prose prose-invert max-w-none space-y-4">
        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Overview</h2>
          <p className="text-subtext">
            We take the protection of your personal data very seriously. We treat
            your personal data confidentially and in accordance with the statutory
            data protection regulations and this privacy policy. This privacy policy
            explains what data we collect and how we use it.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Data Controller</h2>
          <p className="text-subtext">
            Daniel Deusing<br />
            Rosenbergstr. 32<br />
            56579 Hardert, Germany
          </p>
          <p className="text-subtext mt-2">
            Phone: +49 151 16545891<br />
            Email:{" "}
            <a
              href="mailto:info@danieldeusing.de"
              className="text-accent hover:underline"
            >
              info@danieldeusing.de
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Data Collection and Use
          </h2>
          <h3 className="text-lg font-medium text-text mb-2">Server Log Files</h3>
          <p className="text-subtext">
            The provider of the pages automatically collects and stores information
            in so-called server log files, which your browser automatically transmits
            to us. These are:
          </p>
          <ul className="list-disc list-inside text-subtext mt-2 space-y-1">
            <li>Browser type and browser version</li>
            <li>Operating system used</li>
            <li>Referrer URL</li>
            <li>IP address (anonymized)</li>
            <li>Time of the server request</li>
          </ul>
          <p className="text-subtext mt-2">
            This data is processed on the basis of Art. 6(1)(f) GDPR. We have a
            legitimate interest in the technically error-free presentation and
            optimization of our website.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Cookies</h2>
          <p className="text-subtext">
            Our website uses cookies. Cookies are small text files that are stored
            on your device and saved by your browser.
          </p>
          <p className="text-subtext mt-2">
            We only use essential cookies that are necessary for the operation of
            the website, such as storing your cookie consent preference. These do
            not require your consent.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Your Rights</h2>
          <p className="text-subtext">
            Under GDPR, you have the following rights regarding your personal data:
          </p>
          <ul className="list-disc list-inside text-subtext mt-2 space-y-1">
            <li>
              <strong>Right of Access</strong> - You can request confirmation whether
              personal data is being processed and access to this data.
            </li>
            <li>
              <strong>Right to Rectification</strong> - You have the right to request
              correction of inaccurate personal data.
            </li>
            <li>
              <strong>Right to Erasure</strong> - You can request the deletion of
              your personal data under certain conditions.
            </li>
            <li>
              <strong>Right to Restriction</strong> - You can request the restriction
              of processing of your personal data.
            </li>
            <li>
              <strong>Right to Data Portability</strong> - You have the right to
              receive your data in a structured, common, machine-readable format.
            </li>
            <li>
              <strong>Right to Object</strong> - You can object to the processing
              of your personal data at any time for reasons arising from your
              particular situation.
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Third-Party Services
          </h2>
          <p className="text-subtext">
            We do not share your personal data with third parties except where
            necessary to fulfill our contractual obligations or where required by law.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Data Security</h2>
          <p className="text-subtext">
            We use SSL/TLS encryption for all data transmission. Our website is
            hosted on secure servers with appropriate technical and organizational
            security measures.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">CLI Usage</h2>
          <p className="text-subtext">
            The Seedr CLI fetches registry data from GitHub. When an item is
            installed, the CLI sends an anonymous install event (item name, type,
            target tool, scope, and CLI version) to our API for aggregate install
            statistics. No personal data, IP addresses, or identifiers are stored.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Supervisory Authority
          </h2>
          <p className="text-subtext">
            You have the right to lodge a complaint with a supervisory authority if
            you believe that the processing of your personal data violates the GDPR.
            The competent supervisory authority for us is:
          </p>
          <p className="text-subtext mt-2">
            Der Landesbeauftragte für den Datenschutz und die Informationsfreiheit
            Rheinland-Pfalz<br />
            Hintere Bleiche 34<br />
            55116 Mainz, Germany<br />
            <a
              href="https://www.datenschutz.rlp.de"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              www.datenschutz.rlp.de
            </a>
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Changes to This Policy
          </h2>
          <p className="text-subtext">
            We may update this privacy policy from time to time. The current version
            is always available on our website.
          </p>
          <p className="text-subtext mt-2">Last Updated: January 2025</p>
        </section>
      </div>
    </div>
  );
}
