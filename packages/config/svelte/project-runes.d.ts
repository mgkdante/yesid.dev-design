export interface ProjectRunesOptions {
	filename: string;
}

export declare function projectRunes(
	root: string,
): (options: ProjectRunesOptions) => true | undefined;
