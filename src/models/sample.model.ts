// src/models/sample.model.ts

export type SampleStatus = "pending" | "in_progress" | "completed" | "archived";

export interface Sample {
  id: number;
  code: string;            // Unique sample code (e.g. LAB-2025-0001)
  project: string;         // Project or job name
  location?: string;       // Optional: sector, front, coordinates, etc.
  materialType: string;    // Soil, concrete, aggregate, asphalt, etc.
  receivedAt: Date;        // Reception date
  receivedBy: string;      // Name or ID of the operator
  status: SampleStatus;    // Current status of the sample
  notes?: string;          // Optional notes
}

// Temporary in-memory storage (later we will move this to a real database)
let samples: Sample[] = [];
let nextId = 1;

export function getAllSamples(): Sample[] {
  return samples;
}

export function getSampleById(id: number): Sample | undefined {
  return samples.find((sample) => sample.id === id);
}

export function createSample(data: Omit<Sample, "id">): Sample {
  const newSample: Sample = {
    id: nextId++,
    ...data,
  };
  samples.push(newSample);
  return newSample;
}
