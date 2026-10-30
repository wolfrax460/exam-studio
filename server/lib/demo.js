// Sample output for DEMO_MODE=1, so the app can be tried without an API key.

export function demoNotes() {
  return {
    title: 'Demo: Database fundamentals',
    sections: [
      {
        topic: '1.1 Data and information',
        keyPoints: [
          'Data is raw, unorganized facts and figures with little meaning on their own.',
          'Information is data that has been processed or organized so it is meaningful and useful.',
        ],
        example: 'The numbers 1 to 5 are data. "Sales rose over five months" is information.',
      },
      {
        topic: '1.1 Entities and attributes',
        keyPoints: [
          'An entity is a distinct object or concept that can be uniquely identified. It usually becomes a table.',
          'An attribute is a property of an entity. It becomes a column.',
          'A record (row, tuple) is one instance of an entity.',
        ],
        example: 'Customer(CustomerID, Name, Email, Phone).',
      },
      {
        topic: '1.1 Relationships',
        keyPoints: [
          'Types: one-to-one, one-to-many, many-to-one, many-to-many.',
          'A many-to-many relationship needs a junction table holding the foreign keys of both tables.',
        ],
        example: 'Book and Author are linked through Book_Author.',
      },
    ],
  };
}

export function demoCards() {
  return {
    title: 'Demo flashcards',
    cards: [
      { front: 'What is data?', back: 'Raw, unorganized facts and figures with little meaning on their own.', topic: '1.1', cardType: 'term' },
      { front: 'What is information?', back: 'Data that has been processed or organized so it is meaningful and useful.', topic: '1.1', cardType: 'term' },
      { front: 'How is a many-to-many relationship implemented?', back: 'With a junction table that holds the foreign keys of both tables.', topic: '1.1', cardType: 'fact' },
      { front: 'What does an attribute become in a table?', back: 'A column.', topic: '1.1', cardType: 'term' },
      { front: 'Primary key vs foreign key', back: 'A primary key identifies each row of its own table; a foreign key repeats, and holds a primary key from another table.', topic: '1.1', cardType: 'trap' },
    ],
  };
}

export function demoExam() {
  const exam = {
    title: 'Demo exam: Database fundamentals',
    questions: [
      {
        type: 'sequencing', marks: 4,
        prompt: 'Arrange the steps for preparing a data dictionary in the correct order. Write the step numbers from first to last.',
        steps: ['Assign data types to the attributes', 'Identify the entities', 'Specify constraints for each attribute', 'Define the attributes for each entity'],
        sequenceAnswer: [2, 4, 1, 3],
      },
      {
        type: 'matching', marks: 4,
        prompt: 'Match each term in Column A with its description in Column B. Write the correct letter on the line.',
        columnA: ['Attribute', 'Record', 'DBMS', 'Information'],
        columnB: ['Data that has been processed to give it meaning', 'Software used to create and manage databases', 'A property that describes an entity', 'A row holding the values for one instance of an entity'],
        matchAnswers: ['C', 'D', 'B', 'A'],
      },
      {
        type: 'mcq', marks: 4,
        prompt: 'Choose the letter of the correct answer.',
        items: [
          { text: 'Which database model organizes data in a tree where each record has one parent?', options: ['Relational', 'Hierarchical', 'Network', 'Object-oriented'], answer: 'B' },
          { text: 'Which data type is best for storing exact prices such as 1250.75?', options: ['FLOAT', 'TINYINT', 'DECIMAL', 'DATE'], answer: 'C' },
        ],
      },
      {
        type: 'select_all', marks: 5,
        prompt: 'Which of the following are advantages of using a database? Circle ALL that apply.',
        options: ['Data centralization', 'High software and administration cost', 'Data consistency', 'Data sharing and collaboration', 'Performance overhead'],
        correct: ['A', 'C', 'D'],
      },
      {
        type: 'true_false', marks: 4,
        prompt: 'Write True (T) or False (F) for each statement.',
        items: [
          { text: 'A database schema contains the data stored in the tables.', answer: 'False' },
          { text: 'A multivalued attribute is drawn as a double oval in an ERD.', answer: 'True' },
          { text: 'A UNIQUE constraint allows NULL values.', answer: 'True' },
          { text: 'A relation in 1NF may contain repeating groups.', answer: 'False' },
        ],
      },
      {
        type: 'short_answer', marks: 4,
        prompt: 'State the type of relationship for each pair of entities.',
        items: [
          { text: 'Person and Passport', answer: 'One-to-one' },
          { text: 'Customer and Orders', answer: 'One-to-many' },
          { text: 'Students and Classroom', answer: 'Many-to-one' },
          { text: 'Books and Authors', answer: 'Many-to-many' },
        ],
      },
      {
        type: 'essay', marks: 10,
        prompt: 'A school library keeps information about books and members.',
        parts: [
          { label: '(a)', text: 'Identify two entities and give three attributes for each.', marks: 4 },
          { label: '(b)', text: 'State the relationship between them and explain how it is implemented.', marks: 4 },
          { label: '(c)', text: 'Explain why a data dictionary is useful.', marks: 2 },
        ],
        markingPoints: [
          { text: 'Two valid entities, e.g. Book and Member', marks: 1 },
          { text: 'Three relevant attributes for each entity', marks: 3 },
          { text: 'Many-to-many relationship (a member borrows many books, a book is borrowed by many members)', marks: 2 },
          { text: 'Implemented with a junction table (Borrowing) holding foreign keys of both tables', marks: 2 },
          { text: 'A data dictionary documents field names, types, lengths and constraints', marks: 1 },
          { text: 'It gives developers a reference and keeps the design consistent', marks: 1 },
        ],
      },
    ],
  };
  exam.totalMarks = exam.questions.reduce((s, q) => s + q.marks, 0);
  exam.warnings = [];
  return exam;
}

// A structurally complete sample handout: it must pass validateHandout() with no warnings, so it
// doubles as the fixture for the renderer tests. Only its length is small - every section is real.
export function demoHandout() {
  return {
    title: 'Demo handout: Database fundamentals',
    moduleName: 'Database Development',
    moduleCode: 'SWDBD401',
    level: 'Level 4',
    trade: 'Software Development',
    demo: true,
    units: [
      {
        number: '1',
        title: 'Design a relational database',
        learningOutcome: 'Design a normalised relational database for a given business scenario.',
        duration: '45 hours',
        indicativeContents: [
          'Database concepts and the relational model',
          'Normalisation up to third normal form',
        ],
        objectives: [
          'Explain the difference between data and information',
          'Identify entities, attributes and relationships in a scenario',
          'Normalise a set of tables to third normal form',
        ],
        lessons: [
          {
            number: '1.1',
            title: 'Database concepts and the relational model',
            indicativeContent: 'Database concepts and the relational model',
            subtopics: ['Data and information', 'Entities, attributes and records', 'Keys and relationships'],
            keyTerms: [
              { term: 'Data', meaning: 'Raw facts and figures that on their own do not tell you anything useful.' },
              { term: 'Information', meaning: 'Data that has been organised or processed so it answers a question.' },
              { term: 'Entity', meaning: 'A person, place or thing the business keeps records about. It becomes a table.' },
              { term: 'Attribute', meaning: 'One property of an entity, such as a customer name. It becomes a column.' },
              { term: 'Primary key', meaning: 'The column, or smallest group of columns, that identifies each row uniquely.' },
              { term: 'Foreign key', meaning: 'A column that holds the primary key of another table, which is how tables are joined.' },
            ],
            blocks: [
              { kind: 'prose', heading: 'Why a database and not a spreadsheet', text: 'A spreadsheet holds one copy of the data in one file. When two people keep the same customer in two spreadsheets, the two copies drift apart and nobody knows which one is right. A database keeps one copy of each fact, lets many people use it at the same time, and refuses to store a row that breaks its rules.' },
              { kind: 'bullets', heading: 'What data becomes in a database', items: [
                '**Entity:** a thing the business records, such as Customer. It becomes one table.',
                '**Attribute:** a property of that thing, such as Email. It becomes one column.',
                '**Record:** one complete row, holding every attribute for one entity, such as one customer.',
                '**Relationship:** how two entities are linked, such as one customer placing many orders.',
              ] },
              { kind: 'table', heading: 'The two keys you must be able to name', headers: ['Key', 'What it does'], rows: [
                ['Primary key', 'Identifies each row on its own. It can never be empty and never repeats.'],
                ['Foreign key', 'Points at a primary key in another table, so the database can join the two.'],
                ['Composite key', 'Two or more columns used together to identify a row, such as OrderID + ProductID.'],
              ] },
              { kind: 'steps', heading: 'How to turn a scenario into tables', items: [
                'Underline every noun in the scenario. Each one is a possible entity.',
                'List the facts you must keep about each entity. Those are its attributes.',
                'Choose the smallest attribute that is unique for each row. That is the primary key.',
                'For every verb that links two entities, decide one-to-many or many-to-many.',
                'For a many-to-many link, create a junction table holding both primary keys.',
              ] },
            ],
            callouts: [
              { kind: 'tip', label: 'Exam tip', text: 'A question that says "identify the entities" is asking for the things that become tables, not the attributes. Naming Email as an entity is the most common lost mark.' },
              { kind: 'remember', label: 'Remember', text: 'An attribute becomes a column, a record becomes a row, and an entity becomes a table. Examiners ask this in that order.' },
            ],
            workedExample: {
              title: 'Turning a library scenario into entities',
              task: 'A school library lends books to members. It must record which member borrowed which book and when it is due back. Identify the entities, their attributes and the relationship.',
              thinking: 'Read the scenario and mark the nouns first. Then ask what facts must be kept about each noun, and finally what action joins them.',
              steps: [
                'Nouns: school, library, book, member. School is the setting, so the entities are Book and Member.',
                'Attributes of Book: BookID, Title, Author, ISBN. BookID is unique, so it is the primary key.',
                'Attributes of Member: MemberID, FullName, Class, Email. MemberID is the primary key.',
                'The verb "borrowed" joins them. One member borrows many books, and one book is borrowed many times over the years, so it is many-to-many.',
                'A many-to-many link needs a junction table: Loan(LoanID, MemberID, BookID, DateBorrowed, DueDate).',
              ],
              code: 'Book(BookID, Title, Author, ISBN)\nMember(MemberID, FullName, Class, Email)\nLoan(LoanID, MemberID, BookID, DateBorrowed, DueDate)',
              expected: 'Three tables, with BookID and MemberID appearing in Loan as foreign keys, and no repeated book title or member name anywhere.',
              why: 'Each fact is stored once: a title lives in Book only, so correcting a title fixes it everywhere. The Loan table records the event, which is why it needs its own key and the two foreign keys.',
              mistakes: [
                'Putting the book title inside Loan, which repeats it and allows two different spellings.',
                'Making the member name the primary key, which fails when two members share a name.',
                'Forgetting the dates, which are the whole point of a loan record.',
              ],
            },
          },
          {
            number: '1.2',
            title: 'Normalisation up to third normal form',
            indicativeContent: 'Normalisation up to third normal form',
            subtopics: ['Why normalise', 'First normal form', 'Second normal form', 'Third normal form'],
            keyTerms: [
              { term: 'Normalisation', meaning: 'Organising columns and tables so each fact is stored in exactly one place.' },
              { term: 'Redundancy', meaning: 'The same fact stored in more than one row, which lets the copies disagree.' },
              { term: 'Update anomaly', meaning: 'A change that has to be made in several places, and gets missed in one of them.' },
              { term: 'Repeating group', meaning: 'Several values of the same kind crammed into one column, such as three phone numbers.' },
              { term: 'Partial dependency', meaning: 'A non-key column that depends on only part of a composite key.' },
              { term: 'Transitive dependency', meaning: 'A non-key column that depends on another non-key column instead of on the key.' },
            ],
            blocks: [
              { kind: 'prose', heading: 'The problem normalisation solves', text: 'An un-normalised table stores the same fact many times. Every copy is an opportunity for the copies to disagree, and every correction has to be made in every copy. Normalisation removes that repetition step by step, so there is one authoritative copy of each fact.' },
              { kind: 'steps', heading: 'The three steps, in order', items: [
                'First normal form: remove repeating groups and make every column hold a single value.',
                'Second normal form: remove partial dependencies, so every non-key column depends on the whole key.',
                'Third normal form: remove transitive dependencies, so no non-key column depends on another non-key column.',
              ] },
              { kind: 'compare', heading: 'First normal form against third normal form', headers: ['Feature', '1NF', '3NF'], rows: [
                ['Repeating groups', 'Removed', 'Removed'],
                ['Single value per cell', 'Required', 'Required'],
                ['Partial dependency', 'Allowed', 'Removed'],
                ['Transitive dependency', 'Allowed', 'Removed'],
                ['Tables produced', 'Usually one', 'Often three or more'],
              ] },
              { kind: 'table', heading: 'Which normal form removes which problem', headers: ['Problem', 'Removed by'], rows: [
                ['A column holding a list of phone numbers', '1NF'],
                ['A composite key where one column depends on half of it', '2NF'],
                ['A postcode that depends on the town rather than on the key', '3NF'],
              ] },
            ],
            callouts: [
              { kind: 'trap', label: 'Trap', text: 'Second normal form only applies to tables with a composite key. If the key is a single column, a table in 1NF is already in 2NF, and saying otherwise loses the mark.' },
              { kind: 'tip', label: 'Exam tip', text: 'When you are asked to normalise, show the table after each step and name the anomaly you removed. The examiner is marking the reason, not just the final tables.' },
              { kind: 'remember', label: 'Remember', text: '1NF is about repeating groups, 2NF is about part of the key, 3NF is about a non-key column depending on another non-key column.' },
            ],
            workedExample: {
              title: 'Normalising a student results table',
              task: 'Normalise this table to third normal form: Result(StudentID, StudentName, CourseCode, CourseTitle, Lecturer, LecturerRoom, Grade).',
              thinking: 'Find the key first, then look for repetition, then for anything depending on part of the key, then for anything depending on a non-key column.',
              steps: [
                'The key is StudentID + CourseCode, because a student takes many courses and a course has many students.',
                'Check 1NF: every cell holds one value, so the table is already in first normal form.',
                'Check 2NF: StudentName depends on StudentID alone, and CourseTitle depends on CourseCode alone, so both are partial dependencies.',
                'Remove them: Student(StudentID, StudentName) and Course(CourseCode, CourseTitle).',
                'Check 3NF: Lecturer and LecturerRoom depend on CourseCode, not on the whole key, and LecturerRoom depends on Lecturer. That is a transitive dependency.',
                'Remove it: Lecturer(LecturerID, LecturerName, Room), and Course now holds LecturerID.',
                'The remaining table is Result(StudentID, CourseCode, Grade), with both columns as the key.',
              ],
              code: 'Student(StudentID, StudentName)\nCourse(CourseCode, CourseTitle, LecturerID)\nLecturer(LecturerID, LecturerName, Room)\nResult(StudentID, CourseCode, Grade)',
              expected: 'Four tables, each holding facts about one thing only, with no fact stored twice.',
              why: 'A room change now means editing one row in Lecturer instead of every result row. Each removal was justified by naming the dependency, which is what earns the marks.',
              mistakes: [
                'Leaving StudentName in Result, which repeats the name on every course the student takes.',
                'Splitting Result too far and losing the Grade.',
                'Removing a dependency without naming it, which loses the explanation marks.',
              ],
            },
          },
        ],
        diagrams: [
          {
            title: 'From scenario to tables',
            ascii: '+-----------+      +-----------+\n| Scenario  | ---> | Entities  |\n+-----------+      +-----------+\n                         |\n                         v\n                   +-----------+\n                   | Attributes|\n                   +-----------+\n                         |\n                         v\n                   +-----------+\n                   |   Keys    |\n                   +-----------+',
            readSteps: [
              'Start at the top left: the written business scenario is the only input you are given.',
              'The first arrow shows that you read it for nouns, which become candidate entities.',
              'The next arrow shows that each entity gets the facts you must keep about it.',
              'The last arrow shows that you then choose a primary key for each entity.',
            ],
            redraw: 'Draw four boxes down the page and join them with arrows. The marker is looking for the order and for the arrow labels, not for neat handwriting. Label each arrow with the question you asked.',
          },
          {
            title: 'The three normal forms in order',
            ascii: '+-------------+     +-------------+     +-------------+\n| UNF         | --> | 1NF         | --> | 2NF         |\n| repeating   |     | single      |     | no partial  |\n| groups      |     | values      |     | dependency  |\n+-------------+     +-------------+     +-------------+\n                                               |\n                                               v\n                                         +-------------+\n                                         | 3NF         |\n                                         | no transitive|\n                                         +-------------+',
            readSteps: [
              'Read left to right: each box is the table after one more rule has been applied.',
              'The first box is the un-normalised table, which is where you always start.',
              'The arrow into 2NF is the one that depends on having a composite key.',
              'The final box is the target: no non-key column depends on another non-key column.',
            ],
            redraw: 'Draw a chain of boxes with the rule written inside each one. Always write the problem each step removes above the arrow, because that is what the marker ticks.',
          },
          {
            title: 'One-to-many and many-to-many',
            ascii: '+----------+          +----------+\n| Customer | 1      * |  Order   |\n+----------+----------+----------+\n\n+----------+          +----------+\n|  Order   | *      * | Product  |\n+----------+          +----------+\n     |                      |\n     +------+  OrderLine  +--+\n            | (junction)  |\n            +-------------+',
            readSteps: [
              'The top pair shows one-to-many: one customer places many orders.',
              'The crow\'s foot or asterisk marks the many side, and the 1 marks the one side.',
              'The bottom pair shows many-to-many, where neither side can hold the link.',
              'The junction table at the bottom holds both keys and becomes the third table.',
            ],
            redraw: 'Draw the two entities, put 1 and * on the correct sides, then add the junction box between them for the many-to-many. The marker looks for the junction table, not for the drawing style.',
          },
        ],
        memorySheet: [
          { remember: 'Data becomes what?', answer: 'Information, once it is organised to answer a question.' },
          { remember: 'An entity becomes what?', answer: 'A table.' },
          { remember: 'An attribute becomes what?', answer: 'A column.' },
          { remember: 'A record becomes what?', answer: 'A row.' },
          { remember: 'Which key identifies a row?', answer: 'The primary key.' },
          { remember: 'Which key links two tables?', answer: 'The foreign key.' },
          { remember: 'What does 1NF remove?', answer: 'Repeating groups, so every cell holds one value.' },
          { remember: 'What does 2NF remove?', answer: 'Partial dependencies on part of a composite key.' },
          { remember: 'What does 3NF remove?', answer: 'Transitive dependencies between non-key columns.' },
          { remember: 'When is 2NF automatic?', answer: 'When the key is a single column.' },
          { remember: 'What is a junction table for?', answer: 'A many-to-many relationship, holding both foreign keys.' },
          { remember: 'What is a composite key?', answer: 'Two or more columns used together to identify a row.' },
          { remember: 'What is an update anomaly?', answer: 'A change that must be made in several places and gets missed in one.' },
          { remember: 'What is an insert anomaly?', answer: 'A fact that cannot be recorded until an unrelated fact exists.' },
          { remember: 'What is a delete anomaly?', answer: 'Deleting one row destroying facts about something else.' },
          { remember: 'What does a primary key never do?', answer: 'It never repeats and is never empty.' },
          { remember: 'What does a foreign key prevent?', answer: 'An order for a customer who does not exist.' },
          { remember: 'What is cardinality?', answer: 'How many rows on each side of a relationship: one, or many.' },
          { remember: 'What is an ERD?', answer: 'Entity Relationship Diagram: entities as boxes, relationships as lines.' },
        ],
        revision: {
          mcq: [
            { q: 'Which of these is an attribute of the entity Customer?', choices: ['Customer', 'Email address', 'Order', 'Sales department'], answer: 'B', reason: 'An attribute is a property of the entity, so it becomes a column of the Customer table.' },
            { q: 'A table has the composite key OrderID + ProductID. A column ProductName depends only on ProductID. Which normal form is broken?', choices: ['First normal form', 'Second normal form', 'Third normal form', 'None, the table is fine'], answer: 'B', reason: 'A partial dependency, where a column depends on only part of the key, breaks second normal form.' },
            { q: 'What does a junction table contain?', choices: ['Only the primary key of the first table', 'Both foreign keys, and any facts about the link', 'A copy of every column from both tables', 'Nothing but a row number'], answer: 'B', reason: 'A junction table resolves many-to-many by holding the keys of both sides.' },
            { q: 'Which problem does third normal form remove?', choices: ['Repeating groups in a single cell', 'A column depending on another non-key column', 'Two tables sharing a key', 'A missing primary key'], answer: 'B', reason: 'That is a transitive dependency, which is exactly what 3NF removes.' },
            { q: 'A student table stores StudentID, StudentName, CourseID, CourseTitle. What is the correct step?', choices: ['Make StudentName the primary key', 'Split Course into its own table', 'Delete CourseTitle', 'Add a second copy of CourseTitle'], answer: 'B', reason: 'CourseTitle depends on CourseID alone, so Course belongs in its own table.' },
          ],
          trueFalse: [
            { statement: 'A foreign key must be unique in its own table.', answer: 'False', reason: 'It repeats: many orders point at the same customer.' },
            { statement: 'A table in first normal form may still contain a partial dependency.', answer: 'True', reason: '1NF only removes repeating groups; partial dependencies are removed by 2NF.' },
            { statement: 'A primary key may be left empty for a row that is not finished yet.', answer: 'False', reason: 'A primary key can never be empty.' },
            { statement: 'Normalisation usually increases the number of tables.', answer: 'True', reason: 'Each step splits a table when a fact depends on the wrong thing.' },
            { statement: 'A many-to-many relationship can be stored directly in one of the two tables.', answer: 'False', reason: 'It needs a junction table holding both keys.' },
          ],
          scenario: [
            { q: 'A clinic keeps one table with PatientID, PatientName, VisitDate, DoctorName, DoctorRoom. A doctor moves to a new room and the clerk edits only the newest rows, so reports now show two rooms for the same doctor. What has gone wrong, and what do you do?', answer: 'The table has a transitive dependency: DoctorRoom depends on DoctorName, not on the key. Split Doctor out of the table with DoctorID as its key, and keep only DoctorID in the visit table.', reason: 'It is the classic update anomaly, and the fix is third normal form, which is why this scenario is a favourite exam question.' },
            { q: 'A school wants to record that a student takes several courses and each course has several students. A trainee suggests adding a Courses column holding "Maths, Physics" in one cell. Give two reasons why this fails and the correct design.', answer: 'It breaks first normal form because the cell holds a repeating group, and it makes it impossible to ask which students take Physics efficiently. Use a junction table Enrolment(StudentID, CourseID, EnrolledOn).', reason: 'The two reasons are the mark and 1NF is the standard, while the junction table is the design.' },
            { q: 'You are asked to store three phone numbers for each customer. A colleague suggests Phone1, Phone2 and Phone3 columns. What is the problem, and what is the better design?', answer: 'The design caps the number of phones and leaves empty columns, and any question about a phone number has to check three columns. Put phones in their own table Phone(CustomerID, PhoneNumber, Type) with CustomerID as a foreign key.', reason: 'The cap and the empty columns are the two problems; the separate table is the standard fix.' },
            { q: 'A manager asks you to delete a customer who no longer buys, but the system refuses while their orders still exist. Explain why the system behaves that way and the two correct ways forward.', answer: 'A foreign key from Order to Customer is protecting referential integrity, so a child row cannot be orphaned. Either delete or archive the orders first, or mark the customer as inactive instead of deleting them.', reason: 'Naming referential integrity is the mark, and both resolutions are accepted.' },
            { q: 'Two trainees design the same school timetable. One stores the teacher name in every lesson row; the other stores a TeacherID and keeps the name once. Which design will still be correct after a teacher marries and changes their name, and why?', answer: 'The second. The name is stored once, so a single edit corrects every row, while the first design has to update every lesson row and will miss some.', reason: 'This is the update anomaly, and explaining the reason is what earns the second mark.' },
          ],
          extraPractice: [
            { reference: 'Part I, question 3', answer: 'The table is in first normal form but not second, because CourseTitle depends on CourseID alone.', reason: 'Naming the partial dependency is the mark.' },
            { reference: 'Part I, question 7', answer: 'Loan(LoanID, MemberID, BookID, DateBorrowed, DueDate) with two foreign keys.', reason: 'A many-to-many link always needs its own table.' },
            { reference: 'Part II, question 2', answer: 'Third normal form, because Room depends on Lecturer rather than on the key.', reason: 'The dependency, not the table count, is what is marked.' },
            { reference: 'Part II, question 5', answer: 'Split into Customer(CustomerID, Name) and Phone(CustomerID, PhoneNumber).', reason: 'A repeating attribute belongs in its own table.' },
            { reference: 'Part III, question 1', answer: 'The answer key is wrong: both A and C are correct, so the defensible answer is A and C.', reason: 'Say so and give the defensible answer rather than repeating the key.' },
          ],
        },
        practical: {
          scenario: 'A small pharmacy in your town keeps its sales in one spreadsheet. The owner wants a database that records customers, medicines, and each sale, and can answer how much of a medicine was sold in a month.',
          steps: [
            'Read the scenario and list the entities: Customer, Medicine and Sale.',
            'Write the attributes for each entity and choose a primary key for each one.',
            'Decide the relationships: one customer makes many sales, one sale contains many medicines.',
            'Resolve the many-to-many between Sale and Medicine with a SaleItem table.',
            'Normalise your tables to third normal form, naming each dependency you remove.',
            'Create the tables in the database and insert at least three rows in each one.',
            'Write one query that reports the total quantity sold per medicine for a chosen month.',
          ],
          assessor: [
            'Names three entities and gives at least four attributes for each',
            'Chooses a primary key that is unique and never empty for every table',
            'Creates a SaleItem junction table holding both foreign keys',
            'States the normal form reached and names one dependency removed at each step',
            'Creates every table without a syntax error',
            'Inserts at least three rows per table with no foreign key violation',
            'Writes a query using JOIN and SUM with a GROUP BY on the medicine',
            'Explains in one sentence why the junction table is needed',
          ],
          report: [
            'A table listing every table with its columns, key and data type',
            'The entity relationship diagram, drawn by hand, with cardinality marked',
            'The normalisation steps, showing the tables after 1NF, 2NF and 3NF',
            'The SQL used to create the tables, with the output of the insert statements',
            'The report query and its result, with one sentence on what the result shows',
          ],
        },
        studyTips: [
          'When you see "define", think a full sentence with the term and what it does.',
          'When you see "identify the entities", think nouns that become tables, not attributes.',
          'When you see "normalise", think 1NF repeating groups, 2NF part of the key, 3NF non-key on non-key.',
          'When you see a composite key, think second normal form and look for a partial dependency.',
          'When you see "many-to-many", think junction table with both foreign keys.',
          'When you see "primary key", think unique and never empty.',
          'When you see "foreign key", think a value that must already exist in the parent table.',
          'When you see "anomaly", think update, insert or delete, and name which one.',
          'When you see "draw an ERD", think boxes for entities and lines with 1 and * on them.',
          'When you see a scenario with a spreadsheet, think repeating data and redundancy.',
          'When you see "explain the relationship", think cardinality plus one example from the scenario.',
          'When you see a query question, think which tables must be joined and on which key.',
          'When you write a practical answer, do the task and say why you did it that way: in practical work the reason earns marks as well as the action. "I used a parameterised query because it stops SQL injection" scores two marks; "I used a parameterised query" scores one.',
        ],
      },
    ],
    warnings: [],
  };
}
