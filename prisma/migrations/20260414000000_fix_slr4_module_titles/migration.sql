-- Normalize SLR 4 module titles to match SLR 1-3 format ("Modul N – <name>")
UPDATE "CourseModule" SET "title" = 'Modul 1 – Zabavni sustavi 4.0' WHERE "title" = 'Zabavni Sustavi 4.0';
UPDATE "CourseModule" SET "title" = 'Modul 2 – Prometni sustavi 4.0' WHERE "title" = 'Prometni Sustavi 4.0';
UPDATE "CourseModule" SET "title" = 'Modul 3 – Industrijski sustavi 4.0' WHERE "title" = 'Industrijski Sustavi 4.0';
UPDATE "CourseModule" SET "title" = 'Modul 4 – Robotsko vozilo 1.0' WHERE "title" = 'Robotsko Vozilo 1.0';
