export interface ClusterConfig {
    /** Current directory */
    cd: string;
    outputFile: string;
    prefix?: string;
    [key: string]: any;
}

export interface Options {
    reportError?: boolean;
}

export const defaultConfigFileName = 'clusterConfig.json';
