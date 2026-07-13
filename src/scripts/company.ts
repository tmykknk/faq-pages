interface SelectControl {
    value: string;
    addEventListener(type: "change", listener: () => void): void;
}

const searchInput = document.querySelector<HTMLInputElement>("#qa-search");
const categorySelect = document.querySelector(
    "#category-filter",
) as SelectControl | null;
const sections = [...document.querySelectorAll<HTMLElement>(".qa-section")];
const noResults = document.querySelector<HTMLElement>("#no-results");

function applyFilters() {
    const query = searchInput?.value.trim().toLocaleLowerCase("ja") ?? "";
    const selectedCategory = categorySelect?.value ?? "";
    let visibleCount = 0;

    for (const section of sections) {
        const categoryMatches =
            !selectedCategory ||
            section.dataset.categoryId === selectedCategory;
        let sectionCount = 0;
        for (const item of section.querySelectorAll<HTMLElement>(".qa-item")) {
            const searchMatches =
                !query || (item.dataset.searchText ?? "").includes(query);
            item.hidden = !categoryMatches || !searchMatches;
            if (!item.hidden) sectionCount += 1;
        }
        section.hidden = sectionCount === 0;
        visibleCount += sectionCount;
    }

    if (noResults) noResults.hidden = visibleCount !== 0;
}

searchInput?.addEventListener("input", applyFilters);
categorySelect?.addEventListener("change", () => {
    applyFilters();
    const target =
        categorySelect.value && document.getElementById(categorySelect.value);
    if (target && !target.hidden)
        target.scrollIntoView({
            behavior: "smooth",
            block: "start",
        });
});
