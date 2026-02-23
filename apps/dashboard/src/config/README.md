# Hotel config

Edit **`hotel.ts`** to match your property:

- **`ROOMS_PER_FLOOR`** – Array of room counts, one per floor.  
  Example: `[6, 8, 4, 10]` → floor 1 has 6 rooms (101–106), floor 2 has 8 (201–208), floor 3 has 4 (301–304), floor 4 has 10 (401–410).  
  You can use a different number of rooms per floor.

Room IDs are generated as: floor number + 2-digit room index (101, 102, …).  
After changing these values, rebuild or refresh the dashboard.
