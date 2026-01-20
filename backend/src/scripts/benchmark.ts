/**
 * IP Intelligence Module Benchmark
 * 
 * This script measures the performance of the IP classification engine
 * in different scenarios: Cache hits, Tor list checks, and ASN heuristics.
 */

import { classifyIP, initIPIntel } from '../ip-intel';
import { getDatabaseSync } from '../db';
import * as repo from '../ip-intel/repository';

async function runBenchmark() {
    console.log('🚀 SYSTEM: Starting IP Intelligence Benchmark...\n');

    // 1. Initialize System
    const { getDatabase } = await import('../db');
    await getDatabase();
    await initIPIntel();
    const db = getDatabaseSync();

    // 2. Prepare Test Data
    console.log('📦 PREPARING: Seeding test database...');

    // Clear existing test data to ensure clean results
    db.exec(`DELETE FROM tor_nodes WHERE ip LIKE 'benchmark-%'`);
    db.exec(`DELETE FROM ip_reputation WHERE ip LIKE 'benchmark-%'`);

    const ITERATIONS = 10000;
    const testIps = Array.from({ length: 1000 }, (_, i) => `benchmark-ip-${i}`);

    // Seed Tor nodes
    const torIps = testIps.slice(0, 500);
    repo.syncTorNodes(torIps);

    console.log(`✅ READY: Database seeded with ${repo.getTorNodeCount()} Tor nodes.\n`);

    // --- SCENARIO 1: TOR LOOKUP (STALE/COLD) ---
    console.log('📊 SCENARIO 1: Tor Node Detection (Local DB)');
    const scenario1Results = [];
    for (let i = 0; i < 1000; i++) {
        const ip = torIps[i % 500];
        const start = performance.now();
        await classifyIP(ip, true); // bypass cache to force engine run
        scenario1Results.push(performance.now() - start);
    }
    report('Tor Lookup (Bypass Cache)', scenario1Results);

    // --- SCENARIO 2: CACHE HIT (WARM) ---
    console.log('\n📊 SCENARIO 2: Cache Hit (Highest Speed Path)');
    const scenario2Results = [];
    // Ensure IPs are in cache first
    for (const ip of testIps.slice(0, 500)) {
        await classifyIP(ip);
    }

    for (let i = 0; i < ITERATIONS; i++) {
        const ip = testIps[i % 500];
        const start = performance.now();
        await classifyIP(ip);
        scenario2Results.push(performance.now() - start);
    }
    report('Cache Hit (Warm)', scenario2Results);

    // --- SCENARIO 3: BATCH PROCESSING ---
    console.log('\n📊 SCENARIO 3: Parallel Batch Classification');
    const batchSize = 100;
    const batchIps = testIps.slice(0, batchSize);
    const startBatch = performance.now();
    await Promise.all(batchIps.map(ip => classifyIP(ip)));
    const totalBatchTime = performance.now() - startBatch;
    console.log(`✅ Batch of ${batchSize} IPs completed in: ${totalBatchTime.toFixed(2)}ms (${(batchSize / (totalBatchTime / 1000)).toFixed(0)} requests/sec)`);

    console.log('\n🏁 BENCHMARK COMPLETE.');
    process.exit(0);
}

function report(name: string, latencies: number[]) {
    const sorted = [...latencies].sort((a, b) => a - b);
    const sum = sorted.reduce((a, b) => a + b, 0);
    const avg = sum / sorted.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)];
    const p90 = sorted[Math.floor(sorted.length * 0.9)];
    const p99 = sorted[Math.floor(sorted.length * 0.99)];
    const rps = (1000 / avg).toFixed(0);

    console.log(`--------------------------------------------------`);
    console.log(`Result for: ${name}`);
    console.log(`Avg Latency:  ${avg.toFixed(4)} ms`);
    console.log(`p50 Latency:  ${p50.toFixed(4)} ms`);
    console.log(`p90 Latency:  ${p90.toFixed(4)} ms`);
    console.log(`p99 Latency:  ${p99.toFixed(4)} ms`);
    console.log(`Est. Throughput: ${rps} requests/sec`);
    console.log(`--------------------------------------------------`);
}

runBenchmark().catch(console.error);
