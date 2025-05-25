declare module "FaultTolerance" {
	export interface Node {
		host: string;
	}
	export interface Meta {
		/** This array is sorted based on the order the node should be tried. */
		nodes: Node[];
	}

	type IsCommandWorkingStatus = "true" | "false";
	export interface IsCommandWorkingResponse {
		status: IsCommandWorkingStatus;
		/** This should only be present if status is false */
		error?: string;
	}
}
