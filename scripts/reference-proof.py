"""Independent integer reference model for differential QA; shares no TS code."""
import json, sys
result=[]
for case in json.load(sys.stdin):
    low, high, q_low, q_high, price = map(int, case)
    assert 0 < low < high and q_low > 0 and q_high > 0
    def evaluate(p):
        return 1000000 * (q_low * (p >= low) + q_high * (p < high))
    values=[evaluate(p) for p in [0, low-1, low, high-1, high, high+1]]
    cancelled=(q_low+q_high)*500000
    result.append([str(min(values+[cancelled])),str(evaluate(price)),str(cancelled)])
json.dump(result,sys.stdout)
