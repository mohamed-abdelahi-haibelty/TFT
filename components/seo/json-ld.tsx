/**
 * Renders one JSON-LD block.
 *
 * `<` is escaped because everything that reaches here is admin-authored free
 * text — a product name or description containing `</script>` would otherwise
 * close the tag early and have the rest of the page parsed as markup. Three
 * hand-rolled `dangerouslySetInnerHTML` call sites used to do this without the
 * escape; they all route through here now.
 */
export function JsonLd({ data }: { data: object }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }}
    />
  );
}
