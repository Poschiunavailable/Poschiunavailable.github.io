let projectsData = null;

export async function getProjects() {
    if (projectsData) return projectsData;
    
    try {
        const response = await fetch('projects.json');
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        projectsData = await response.json();
        return projectsData;
    } catch (error) {
        console.error('Failed to load projects:', error);
        return [];
    }
}