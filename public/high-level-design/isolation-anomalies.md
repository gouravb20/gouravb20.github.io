                 CONCURRENCY ANOMALIES
                         │
          ┌──────────────┴──────────────┐
          │                             │
       READ SIDE                    WRITE SIDE
          │                             │
     Dirty read                    Dirty write
          │                             │
 Non-repeatable read             Lost update
          │                             │
     Read skew                    Write skew
          │
    Phantom read
