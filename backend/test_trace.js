const { buildGraph } = require('./utils/dijkstra');
const { NODES, EDGES } = require('./data/nerNetwork');

const graph = buildGraph();

function getReachable(startNode) {
  const visited = new Set();
  const queue = [startNode];
  visited.add(startNode);
  
  while(queue.length > 0) {
    const curr = queue.shift();
    if(graph[curr]) {
      for(const edge of graph[curr]) {
        if(!visited.has(edge.to)) {
          visited.add(edge.to);
          queue.push(edge.to);
        }
      }
    }
  }
  return visited;
}

console.log("=== TRACING GRAPH DISCONNECTIONS ===");

const jowaiReachable = getReachable('jowai');
console.log(`From Jowai, ${jowaiReachable.size} nodes are reachable.`);

if(!jowaiReachable.has('ziro')) {
  console.log("Ziro is NOT reachable from Jowai.");
  
  // Find nodes that are isolated or in a different component
  const ziroReachable = getReachable('ziro');
  console.log(`From Ziro, ${ziroReachable.size} nodes are reachable:`, Array.from(ziroReachable));
  
  const itanagarReachable = getReachable('itanagar');
  console.log(`From Itanagar, ${itanagarReachable.size} nodes are reachable:`, Array.from(itanagarReachable));

  // Let's see what edges connect TO Itanagar or Ziro
  const toItanagar = EDGES.filter(e => e.to === 'itanagar' || e.from === 'itanagar');
  console.log(`Edges connected to Itanagar:`, toItanagar);
  
  const toZiro = EDGES.filter(e => e.to === 'ziro' || e.from === 'ziro');
  console.log(`Edges connected to Ziro:`, toZiro);

  // Check Jorhat -> Itanagar connection (mentioned in edges)
  const jorhatToItanagar = EDGES.filter(e => (e.from === 'jorhat' && e.to === 'itanagar') || (e.from === 'itanagar' && e.to === 'jorhat'));
  console.log('Jorhat - Itanagar edges:', jorhatToItanagar);
}
