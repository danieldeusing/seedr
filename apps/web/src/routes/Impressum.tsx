export function Impressum() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <p className="prompt">cat imprint.txt</p>
      <h1 className="glow mt-6 text-2xl font-bold tracking-tight">
        Imprint
        <span className="cursor-block" aria-hidden />
      </h1>

      <div className="max-w-none">
        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Information according to § 5 DDG
          </h2>
          <p className="text-text leading-relaxed">
            Daniel Deusing<br />
            Doutor Vicente Machado, 958 - Centro<br />
            86410-000 Ribeirão Claro - PR<br />
            Brazil
          </p>
          <p className="text-text leading-relaxed mt-3">
            CNPJ: 53.499.113/0001-40<br />
            Municipal registration: 05819384
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">Contact</h2>
          <p className="text-text leading-relaxed">
            Phone: +49 151 16545891<br />
            Email:{" "}
            <a href="mailto:mail@danieldeusing.de" className="link-quiet">
              mail@danieldeusing.de
            </a>
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            EU dispute resolution
          </h2>
          <p className="text-text leading-relaxed">
            The European Commission provides a platform for online dispute
            resolution (ODR):{" "}
            <a
              href="https://ec.europa.eu/consumers/odr/"
              target="_blank"
              rel="noopener noreferrer"
              className="link-quiet"
            >
              https://ec.europa.eu/consumers/odr/
            </a>
          </p>
          <p className="text-text leading-relaxed mt-3">
            We are neither willing nor obliged to participate in dispute
            resolution proceedings before a consumer arbitration board.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Liability for content
          </h2>
          <p className="text-text leading-relaxed">
            The contents of these pages were created with great care, but we
            cannot guarantee that they are accurate, complete, or up to date. As
            a service provider we are responsible for our own content on these
            pages in accordance with § 7 Abs. 1 DDG. According to §§ 8 to 10
            DDG, however, we are not obliged to monitor transmitted or stored
            third-party information or to investigate circumstances that
            indicate illegal activity.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Liability for links
          </h2>
          <p className="text-text leading-relaxed">
            This site contains links to external third-party websites over whose
            content we have no influence. We therefore cannot accept any
            liability for this external content; the respective provider or
            operator of the linked pages is always responsible for it. Should we
            become aware of any infringement, we will remove the affected link
            immediately.
          </p>
        </section>

        <section className="mt-10">
          <h2 className="comment text-xs text-subtext uppercase mb-3">
            Copyright
          </h2>
          <p className="text-text leading-relaxed">
            The content and works on these pages created by the site operator
            are subject to German copyright law. Duplication, processing,
            distribution, and any kind of exploitation outside the limits of
            copyright law require the written consent of the respective author
            or creator.
          </p>
        </section>
      </div>
    </div>
  );
}
