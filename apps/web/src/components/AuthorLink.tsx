import type { Author } from "@/lib/types";

interface AuthorLinkProps {
  author: Author;
  className?: string;
}

export function AuthorLink({ author, className = "" }: AuthorLinkProps) {
  if (author.url) {
    return (
      <a
        href={author.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`text-subtext hover:text-text transition-colors ${className}`}
      >
        by {author.name}
      </a>
    );
  }

  return <span className={`text-subtext ${className}`}>by {author.name}</span>;
}
