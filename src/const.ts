export interface ClusterConfig {
    /** Current directory */
    cd: string;
    outputFile: string;
    prefix?: string;
    [key: string]: any;
}

export const defaultConfigFileName = 'clusterConfig.json';
