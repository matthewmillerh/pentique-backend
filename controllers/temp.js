function transformCategories(data) {
    const finalNavigation = []
    // Maps to keep track of created category objects by their unique identifiers
    // This helps us avoid creating duplicate objects and link children correctly.
    const topLevelMap = new Map() // Key: category1ID, Value: category object {id, name, subcategories}
    const level2Map = new Map() // Key: `${category1ID}-${category2Name}`, Value: category object {name, subcategories}

    data.forEach(row => {
        // --- Process Top Level Category ---
        if (!topLevelMap.has(row.category1ID)) {
            const topCategory = {
                id: row.category1ID,
                name: row.category1Name,
                subcategories: [],
            }
            finalNavigation.push(topCategory)
            topLevelMap.set(row.category1ID, topCategory)
        }
        const currentTopCategory = topLevelMap.get(row.category1ID)

        // --- Process Level 2 Category ---
        if (row.category2Name !== null) {
            // Create a unique key for level 2 based on its parent and its own name
            const level2Key = `${row.category1ID}-${row.category2Name}`

            if (!level2Map.has(level2Key)) {
                const level2Category = {
                    // Note: No ID for level 2 provided in your data, so we use just name
                    name: row.category2Name,
                    subcategories: [],
                }
                currentTopCategory.subcategories.push(level2Category)
                level2Map.set(level2Key, level2Category)
            }
            const currentLevel2Category = level2Map.get(level2Key)

            // --- Process Level 3 Category ---
            if (row.category3Name !== null) {
                // Check if this level 3 category already exists under the current level 2.
                // We check by name since there's no ID for level 3.
                const existingLevel3 = currentLevel2Category.subcategories.find(
                    sub => sub.name === row.category3Name,
                )

                if (!existingLevel3) {
                    const level3Category = {
                        // Note: No ID for level 3 provided in your data, so we use just name
                        name: row.category3Name,
                    }
                    currentLevel2Category.subcategories.push(level3Category)
                }
            }
        }
    })

    return finalNavigation
}

const nestedNavigation = transformCategories(flatCategoryData)
