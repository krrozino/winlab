export type PreflightStatus = "PASS" | "WARN" | "BLOCK";

export type PreflightCheck = {
  id: string;
  label: string;
  status: PreflightStatus;
  message: string;
};

export type PreflightReport = {
  schemaVersion: 1;
  generatedAt: string;
  computerName: string;
  profileName: string;
  windows: {
    caption: string;
    version: string;
    buildNumber: string;
    architecture: string;
  };
  status: PreflightStatus;
  summary: {
    score: number;
    pass: number;
    warn: number;
    block: number;
  };
  checks: PreflightCheck[];
};
