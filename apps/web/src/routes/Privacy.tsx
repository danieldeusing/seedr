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

      <div className="max-w-none space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Overview</h2>
          <p className="text-subtext">
            I take the protection of your personal data seriously. This site
            runs without advertising, without tracking, and without analytics
            cookies — I collect as little data as technically possible. This
            policy explains what data is processed when you use the website
            and the Seedr CLI, and what rights you have under the EU General
            Data Protection Regulation (GDPR).
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
            Hosting (Cloudflare)
          </h2>
          <p className="text-subtext">
            This website is hosted on Cloudflare Pages, a service of
            Cloudflare, Inc., 101 Townsend St., San Francisco, CA 94107, USA.
            When you visit the site, your browser connects to Cloudflare's
            servers, which technically requires processing of connection data
            — in particular your IP address, the requested URL, browser type,
            and the time of the request. Cloudflare processes this data on my
            behalf as a processor (Art. 28 GDPR) to deliver the site reliably
            and securely (e.g. DDoS protection). I do not receive or store
            server log files myself.
          </p>
          <p className="text-subtext mt-2">
            The legal basis is Art. 6(1)(f) GDPR — my legitimate interest in
            the secure and efficient delivery of this website. Cloudflare may
            process data in the USA; transfers are safeguarded by Cloudflare's
            certification under the EU-U.S. Data Privacy Framework and by
            standard contractual clauses. Details:{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              Cloudflare Privacy Policy
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            No Cookies, Local Storage Only
          </h2>
          <p className="text-subtext">
            This site does not set any cookies and does not use any tracking
            or analytics tools. Two values are stored in your browser's local
            storage only: your chosen color theme and your consent banner
            choice. These values never leave your device, are not transmitted
            to me or anyone else, and serve solely to provide functions you
            explicitly requested (§ 25 Abs. 2 TDDDG — no consent required).
            You can delete them at any time via your browser settings.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            CLI Install Statistics
          </h2>
          <p className="text-subtext">
            The Seedr CLI fetches registry content from GitHub
            (raw.githubusercontent.com). During those downloads, GitHub, Inc.
            (USA) receives your IP address as part of the technical request —
            see the{" "}
            <a
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent hover:underline"
            >
              GitHub Privacy Statement
            </a>
            .
          </p>
          <p className="text-subtext mt-2">
            When an item is installed, the CLI sends an install event to my
            API containing: item name, item type, target tool, installation
            scope, and CLI version. The server derives a coarse country code
            from the request and stores it together with the event and a
            timestamp. Your IP address is not stored. The stored data
            contains no identifiers and cannot be traced back to you. The
            legal basis is Art. 6(1)(f) GDPR — my legitimate interest in
            aggregate usage statistics for the registry.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">Your Rights</h2>
          <p className="text-subtext">
            Under the GDPR, you have the following rights regarding your
            personal data:
          </p>
          <ul className="list-disc list-inside text-subtext mt-2 space-y-1">
            <li>
              <strong>Right of Access</strong> (Art. 15) - You can request
              confirmation whether personal data is being processed and access
              to this data.
            </li>
            <li>
              <strong>Right to Rectification</strong> (Art. 16) - You have the
              right to request correction of inaccurate personal data.
            </li>
            <li>
              <strong>Right to Erasure</strong> (Art. 17) - You can request the
              deletion of your personal data under certain conditions.
            </li>
            <li>
              <strong>Right to Restriction</strong> (Art. 18) - You can request
              the restriction of processing of your personal data.
            </li>
            <li>
              <strong>Right to Data Portability</strong> (Art. 20) - You have
              the right to receive your data in a structured, common,
              machine-readable format.
            </li>
            <li>
              <strong>Right to Object</strong> (Art. 21) - You can object to
              the processing of your personal data at any time for reasons
              arising from your particular situation.
            </li>
          </ul>
          <p className="text-subtext mt-2">
            To exercise these rights, contact me at the address above. Note
            that the install statistics contain no identifiers, so I cannot
            associate stored events with individual persons.
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Supervisory Authority
          </h2>
          <p className="text-subtext">
            You have the right to lodge a complaint with a data protection
            supervisory authority (Art. 77 GDPR). The authority responsible
            for me is:
          </p>
          <p className="text-subtext mt-2">
            Der Landesbeauftragte für den Datenschutz und die
            Informationsfreiheit Rheinland-Pfalz<br />
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
          <h2 className="text-lg font-semibold text-text mb-3">Data Security</h2>
          <p className="text-subtext">
            All connections to this website and to the install statistics API
            are encrypted with TLS (HTTPS).
          </p>
        </section>

        <section>
          <h2 className="text-lg font-semibold text-text mb-3">
            Changes to This Policy
          </h2>
          <p className="text-subtext">
            I may update this privacy policy when the site's functionality
            changes. The current version is always available on this page.
          </p>
          <p className="text-subtext mt-2">Last updated: June 2026</p>
        </section>
      </div>
    </div>
  );
}
