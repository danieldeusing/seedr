export function Privacy() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <p className="prompt">cat privacy.txt</p>
      <h1 className="glow mt-6 text-2xl font-bold tracking-tight">
        Privacy
        <span className="cursor-block" aria-hidden />
      </h1>

      <div className="max-w-none">
        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">Overview</h2>
          <p className="text-text leading-relaxed">
            seedr is a registry of AI coding tools — skills, plugins, hooks,
            agents, MCP servers, and settings — that you browse on this site and
            install with the seedr command-line tool (CLI). This policy covers
            both. There is no advertising, no tracking, no web analytics, no
            profiling, and no user accounts. We process as little data as
            technically possible. This page explains what data is processed when
            you use seedr and what rights you have under the EU General Data
            Protection Regulation (GDPR).
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Data controller
          </h2>
          <p className="text-text leading-relaxed">
            Daniel Deusing<br />
            Doutor Vicente Machado, 958 - Centro<br />
            86410-000 Ribeirão Claro - PR<br />
            Brazil
          </p>
          <p className="text-text leading-relaxed mt-3">
            CNPJ: 53.499.113/0001-40<br />
            Phone: +49 151 16545891<br />
            Email:{" "}
            <a href="mailto:mail@danieldeusing.de" className="link-quiet">
              mail@danieldeusing.de
            </a>
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Hosting (Cloudflare Pages)
          </h2>
          <p className="text-text leading-relaxed">
            This website is hosted on Cloudflare Pages, a service of Cloudflare,
            Inc., 101 Townsend St., San Francisco, CA 94107, USA. When you visit
            the site, your browser connects to Cloudflare's servers, which
            technically requires processing of connection data — in particular
            your IP address, the requested URL, browser type, and the time of
            the request (server logs). Cloudflare processes this data on our
            behalf as a processor (Art. 28 GDPR) to deliver the site reliably
            and securely. We do not receive or store server log files ourselves.
          </p>
          <p className="text-text leading-relaxed mt-3">
            The legal basis is Art. 6(1)(f) GDPR — our legitimate interest in
            the secure and efficient delivery of this website. Cloudflare may
            process data in the USA; transfers are safeguarded by Cloudflare's
            certification under the EU-U.S. Data Privacy Framework and by
            standard contractual clauses. Details:{" "}
            <a
              href="https://www.cloudflare.com/privacypolicy/"
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet"
            >
              Cloudflare Privacy Policy
            </a>
            .
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            No cookies — local storage only
          </h2>
          <p className="text-text leading-relaxed">
            This site sets no cookies and runs no tracking or analytics tools.
            It stores a few values in your browser's local storage to remember
            your interface preferences: your chosen color theme ("theme"),
            whether the typing animation is on or off ("anim"), and your
            cookie-banner choice ("seedr-cookie-consent"). Your browser also
            keeps your scroll position per page in session storage so it can be
            restored when you navigate back or forward; this is cleared when you
            close the tab. The fonts and design system are bundled with the site
            and served from our own origin, so no web-font provider is contacted.
          </p>
          <p className="text-text leading-relaxed mt-3">
            None of these values ever leave your device, are not transmitted to
            us or anyone else, and serve solely functions you explicitly use
            (§ 25 Abs. 2 TDDDG — no consent required). Search runs entirely in
            your browser over a list bundled with the site, so your search
            queries are never sent anywhere. You can delete all stored values at
            any time via your browser settings.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Cookie banner
          </h2>
          <p className="text-text leading-relaxed">
            On your first visit the site shows a small banner. Whichever button
            you choose ("Decline", "Essential Only", or "Accept All"), your
            choice is saved in local storage only ("seedr-cookie-consent") so the
            banner is not shown again. Because the site sets no cookies and loads
            no tracking or analytics regardless of your choice, the banner only
            dismisses itself — no processing depends on it.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            File previews from GitHub
          </h2>
          <p className="text-text leading-relaxed">
            Most registry items point to a source repository hosted on GitHub.
            When you open such an item and click a file in its preview, your
            browser fetches that file's contents directly from GitHub
            (raw.githubusercontent.com). As part of this technical request,
            GitHub, Inc. (USA) receives your IP address and browser information.
            This only happens when you explicitly click to preview a file — not
            while browsing or searching, and not for items whose files are served
            from this site. The legal basis is Art. 6(1)(f) GDPR — our legitimate
            interest in letting you preview source files without copying them.
            Details:{" "}
            <a
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet"
            >
              GitHub Privacy Statement
            </a>
            .
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            CLI install statistics
          </h2>
          <p className="text-text leading-relaxed">
            The seedr CLI fetches registry content from GitHub
            (raw.githubusercontent.com). During those downloads, GitHub, Inc.
            (USA) receives your IP address as part of the technical request. See
            the{" "}
            <a
              href="https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement"
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet"
            >
              GitHub Privacy Statement
            </a>
            .
          </p>
          <p className="text-text leading-relaxed mt-3">
            When you install an item, the CLI sends an install event to our own
            API containing exactly the item name, the item type, the target tool,
            the installation scope, and the CLI version. Our server derives a
            coarse country code from the request and stores it together with the
            event and a timestamp. Your IP address is not stored. The stored data
            contains no identifiers and cannot be traced back to you; it serves
            only aggregate usage statistics for the registry. The legal basis is
            Art. 6(1)(f) GDPR — our legitimate interest in understanding which
            items are used. You can switch this off entirely by setting the
            environment variable{" "}
            <code className="text-accent">SEEDR_NO_TELEMETRY</code> before
            running the CLI.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            External links
          </h2>
          <p className="text-text leading-relaxed">
            This website links to external third-party sites such as GitHub
            repositories. When you follow such a link, the privacy policy of the
            respective provider applies; data is only transferred to them once
            you click.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Data security
          </h2>
          <p className="text-text leading-relaxed">
            All connections to this website and to the install-statistics API are
            encrypted in transit via TLS (HTTPS).
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Your rights
          </h2>
          <p className="text-text leading-relaxed">
            Regarding your personal data, you have the right to access (Art. 15
            GDPR), rectification (Art. 16), erasure (Art. 17), restriction of
            processing (Art. 18), data portability (Art. 20), and objection to
            processing (Art. 21). To exercise these rights, contact us at the
            address above. Please note that the install statistics contain no
            identifiers, so stored install events cannot be associated with an
            individual person and therefore cannot be retrieved or deleted on an
            individual basis.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Supervisory authority
          </h2>
          <p className="text-text leading-relaxed">
            You have the right to lodge a complaint with a data protection
            supervisory authority (Art. 77 GDPR). The authority responsible for
            us is:
          </p>
          <p className="text-text leading-relaxed mt-3">
            Der Landesbeauftragte für den Datenschutz und die
            Informationsfreiheit Rheinland-Pfalz<br />
            Hintere Bleiche 34<br />
            55116 Mainz<br />
            <a
              href="https://www.datenschutz.rlp.de"
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet"
            >
              www.datenschutz.rlp.de
            </a>
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">Changes</h2>
          <p className="text-text leading-relaxed">
            We update this privacy policy when the site's or the CLI's
            functionality changes. The current version is always available on
            this page.
          </p>
          <p className="text-text leading-relaxed mt-3">
            Last updated: June 2026
          </p>
        </section>
      </div>
    </div>
  );
}
