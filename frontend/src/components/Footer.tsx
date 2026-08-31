/**
 * Footer chassis — boilerplate shell. Structure stays; content is yours to drop
 * in. Empty column/social slots are marked below. The prebuilt `footer7`
 * shadcnblocks block still lives in src/components/ if you'd rather start from
 * that instead — import it here and feed it props.
 */
export function Footer() {
    return (
        <footer className="border-t border-muted-foreground/25 py-12">
            <div className="container">
                {/* Columns slot — drop link columns / nav here */}
                <div className="flex flex-col gap-8 md:flex-row md:justify-between">
                    {/* e.g. brand + description block */}
                    {/* e.g. <nav> link columns </nav> */}
                    {/* e.g. social icons (react-icons/fa) */}
                </div>

                {/* Legal row */}
                <div className="mt-8 flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
                    <p>© {new Date().getFullYear()}</p>
                    {/* e.g. <div> legal links </div> */}
                </div>
            </div>
        </footer>
    );
}
