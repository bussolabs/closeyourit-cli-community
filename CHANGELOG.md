# Changelog

## [Unreleased]

## [0.36.0] - 2026-10-22

### Aggiunto

- **Invio della copertura dei test.** `coverage push` legge il `.resultset.json` di SimpleCov, unisce le parti dei test paralleli e manda la copertura di un ramo con il token di ingest del progetto.

## [0.35.1] - 2026-10-19

### Corretto

- **Link di accesso cliccabile.** `login` ora stampa il link con il codice già dentro: basta cliccarlo nel terminale per autorizzare la CLI.

## [0.35.0] - 2026-10-11

### Aggiunto

- **Cambiare organizzazione.** `org switch <slug>` rende attiva un'altra organizzazione. La prima volta chiede l'accesso nel browser, poi il cambio è immediato. `org list` mostra le organizzazioni salvate.

## [0.34.1] - 2026-10-08

### Corretto

- **L'avviso di aggiornamento arriva subito.** Ora segnala una nuova versione appena esce, senza aspettare 24 ore.

## [0.34.0] - 2026-10-08

### Aggiunto

- **Solo i tuoi ticket ancora aperti.** `tickets list` accetta `--assignee me` e `--open`: mostra solo i ticket assegnati a te e non ancora conclusi.

## [0.33.1] - 2026-10-07

### Corretto

- **L'avviso propone solo versioni installabili.** L'avviso di aggiornamento indica solo versioni uscite da almeno 24 ore, quelle che mise accetta di installare.

## [0.33.0] - 2026-10-07

### Aggiunto

- **Avviso quando `cyi` è vecchia.** Una volta al giorno la CLI controlla se c'è una versione nuova e, se serve, stampa come aggiornarla. L'avviso esce su stderr, quindi `--json` resta pulito. In CI o con `CLOSEYOURIT_NO_UPDATE_CHECK=1` tace.

### Corretto

- **Mapping ProGuard fino a 8 MiB.** `artifacts proguard-maps` accetta file di mapping fino a 8 MiB.

## [0.32.1] - 2026-10-07

### Sicurezza

- **Segreti che non toccano le variabili di sistema.** `cyi run` e `cyi personal run` ignorano i segreti chiamati come `PATH`, `NODE_OPTIONS`, `LD_*` e simili, avvisandoti per nome. Il login apre il browser solo su un indirizzo https dello stesso server e su Windows non passa più dal prompt dei comandi. (CYCL-74)

## [0.32.0] - 2026-10-07

### Aggiunto

- **Il tuo computer per i Puckies.** `cyi puck connect` collega questo computer a un Puck: ogni sua richiesta aspetta il tuo sì e può usare solo cartelle e comandi permessi. Ctrl+C lo scollega. (CYRA-1029)

## [0.31.0] - 2026-10-06

### Modificato

- **Indirizzo predefinito app.closeyour.it.** Senza configurazione, `cyi` si collega a `https://app.closeyour.it`. Chi ha già salvato `www.closeyour.it` continua a funzionare. (CYRA-996)

## [0.30.0] - 2026-10-04

### Aggiunto

- **Source map private dal terminale.** I comandi `artifacts source-maps` caricano, elencano, mostrano ed eliminano le mappe. Il caricamento estrae gli intervalli delle funzioni e rimuove il codice sorgente incorporato. (CYRA-955)
- **Mapping ProGuard/R8 con identità esplicita.** I comandi `artifacts proguard-maps` gestiscono mapping privati associati a release e debug ID, preservando i commenti necessari alla ricostruzione dello stack. (CYRA-956)
- **Simboli nativi associati alla build.** I comandi `artifacts native-symbols` gestiscono file ELF, Mach-O, PE e PDB con architettura e identità esatte. I nuovi comandi richiedono le corrispondenti API e i servizi del backend. (CYRA-957)

### Sicurezza

- **Credenziali legate al server corretto.** Cambiare URL non inoltra il token salvato a un altro backend e un login fallito conserva la configurazione precedente. I download privati creano file accessibili solo al proprietario senza seguire collegamenti simbolici.
- **Caricamenti limitati a file espliciti.** Gli artifact sono letti da un solo descrittore con limiti di dimensione; i sistemi senza apertura sicura rifiutano il caricamento. Contenuti sorgente, mapping e binari non vengono stampati.
- **Dipendenze aggiornate.** Rimosse le dipendenze vulnerabili degli strumenti di sviluppo e aggiornati i pacchetti usati dalla CLI. Questi aggiornamenti non modificano i comandi esistenti.

## [0.29.5] - 2026-10-01

### Modificato

- **Manutenzione interna.** Commenti e test sono in inglese e i controlli automatici girano senza cache condivisa. Per chi usa `cyi` non cambia niente.

## [0.29.4] - 2026-09-23

### Corretto

- **Gli argomenti dopo `--` arrivano intatti al comando lanciato.** `cyi run -p KEY -e development -- bin/rails server -p 3021` non si ferma più su «spawn -p ENOENT»: anche `-p` ed `-e` scritti dopo `--` restano del comando figlio. (CYCL-63)

## [0.29.3] - 2026-09-14

### Corretto

- **La guida dei comandi di modifica dice cosa cambia davvero.** Testo di aiuto ed esempi di `update` chiariscono che vengono inviati solo i campi passati. Il difetto che azzerava gli altri campi stava nel server ed è corretto lì. (CYCL-62)

## [0.29.2] - 2026-09-09

### Aggiunto

- **Monetizzazione, rischi e idee collegate dal terminale.** `ideas create` e `ideas update` accettano `--monetization` e `--risks`; `ideas create --evolves <id>` propone un'evoluzione già collegata alla base; `ideas link` e `ideas unlink` collegano due idee. `ideas show` stampa tutto. (CYCL-61)

- **`secrets set` avvisa quando il valore è già in altri progetti.** Se lo stesso valore esiste in altri progetti dell'organizzazione, dopo il salvataggio la CLI stampa quanti sono e il link alla pagina del vault per portarlo tra i Secret dell'organizzazione. Mai i nomi dei progetti.

### Corretto

- Le 0.29.0 e 0.29.1 non sono uscite: prima un controllo della CI, poi la pubblicazione su npm che cercava un token invece di usare l'accesso fidato. Stesso contenuto, numero nuovo.

## [0.28.0] - 2026-09-06

### Aggiunto

- **Le domande di un ticket si fanno e si rispondono dal terminale.** `tickets questions` le elenca, ne pone una (anche bloccante), risponde e ritira quelle rimaste senza risposta. Prima esistevano solo sul sito.

## [0.27.0] - 2026-09-03

### Aggiunto

- **La ricerca della conoscenza può guardare anche fra le proposte.** `kb search --status all` include le pagine in attesa di revisione e quelle scartate, con lo stato in colonna. Senza il flag trova solo le accettate, come prima.

## [0.26.0] - 2026-09-03

### Aggiunto

- **La salute della conoscenza si controlla con un comando.** `kb doctor` dice quali pagine nessuna ricerca troverà, quali collegamenti sono rimasti appesi e quali proposte sono ferme da settimane. Ogni verifica porta il passo sicuro da fare: il comando non cambia niente da solo.
- **La conoscenza si legge da qualunque assistente.** `cyi mcp` la offre con il protocollo standard MCP: cercare, chiedere, leggere e proporre pagine senza istruzioni scritte su misura. Una proposta entra sempre in revisione, e i limiti restano quelli del proprio accesso.
- **La conoscenza del progetto si legge senza chiederla.** `kb context` stampa l'elenco corto delle pagine del progetto della cartella corrente, riconosciuto dal remote git. Con `--quiet` non disturba mai: fuori da un progetto tace, se il servizio non risponde scrive una riga. `KB_CONTEXT_DISABLE=1` lo spegne.

## [0.25.1] - 2026-09-03

### Corretto

- **Creando un ticket, un guasto nella stampa non lo fa più sembrare mai nato.** Se qualcosa andava storto dopo la creazione, il comando usciva in errore senza nominarlo: chi leggeva lo ricreava, e così è nato un doppione. Ora il codice del ticket esce comunque, insieme al motivo del guasto.

## [0.25.0] - 2026-09-03

### Aggiunto

- **Accettare e scartare le pagine di conoscenza dal terminale.** `kb approve` e `kb reject` chiudono la revisione di una pagina proposta senza aprire il sito. Restano decisioni di una persona: un accesso automatico viene rifiutato.

### Corretto

- **Il rifiuto del revisore automatico dice tutto quello che c'è da correggere.** Prima si leggeva una riga sola; ora compaiono tutte le regole violate, il formato riconosciuto, il titolo suggerito e l'eventuale doppione. Con `--json` i dettagli sono nella busta dell'errore.

## [0.24.2] - 2026-09-02

### Sicurezza

- **I passi automatici della pubblicazione sono bloccati sul contenuto verificato.** Erano richiamati per nome di versione: chi controlla quel nome poteva spostarlo su codice diverso e la nostra pubblicazione lo avrebbe eseguito. Ora ognuno è bloccato sulla sua impronta esatta, e un controllo ferma chi torna indietro.

### Corretto

- **Le azioni pericolose si confermano con `--yes`.** Importare o cancellare segreti, eliminare un progetto e le altre azioni che il server considera pericolose si fermavano con un errore che chiedeva una conferma impossibile da dare. Ora ogni comando accetta `--yes`; senza, l'errore spiega cosa aggiungere.
- **Ogni gruppo di comandi dice a cosa serve.** Nell'aiuto e nel catalogo pubblicato trentacinque gruppi apparivano senza una riga che li spiega: avvisi, ambienti, membri, ruoli, team, monitor e gli altri ora ce l'hanno. Un controllo automatico ferma un gruppo nuovo che nasce muto.

## [0.24.1] - 2026-08-31

### Corretto
- **Il comando della copertura ora c'è davvero.** Una regola troppo larga sull'elenco dei file da
  ignorare aveva escluso dal rilascio proprio il comando `coverage show`: la 0.24.0 esiste come
  etichetta ma non è mai stata pubblicata. La regola ora ignora solo la cartella dei report.

## [0.24.0] - 2026-08-31

### Aggiunto

- **`coverage show`: la copertura pubblicata dalla CI si legge senza rigirare le prove.** Per ogni ramo del progetto vedi l'ultima fotografia: righe e rami percorsi, file mai caricati, quando è stata presa. È il dato su cui si decide se fidarsi della misura.
- **`usage list` e `usage reporters`: cosa viene davvero usato, e chi lo sta dicendo.** Il primo elenca le parti del prodotto viste in esecuzione; il secondo dice quale applicazione sta mandando il dato e da quando — la differenza fra «mai chiamata» e «nessuno ancora misura».


- **`tickets clarifications`: lo stato di una domanda in attesa lo dice il sistema.** Prima quello stato viveva nel testo della discussione, e chi lo leggeva doveva indovinarlo: bastava che fosse il sistema stesso a scriverci una riga qualsiasi perché venisse scambiata per una risposta e il ticket ripartisse senza che nessuno avesse risposto. Adesso c'è un comando che lo chiede a chi lo sa: quanti giri sono stati fatti, se è arrivata una risposta, e cosa è stato chiesto in ognuno.

## [0.23.1] - 2026-08-21

### Corretto

- **Il controllo che confronta il numero del rilascio col numero dentro il pacchetto non dà più la colpa alla cosa sbagliata.** Prima di pubblicare, il sistema verifica che l'etichetta della versione e il numero scritto dentro il pacchetto coincidano. Quel controllo gira per primo, apposta, così se qualcosa non torna te ne accorgi in pochi secondi invece che a lavoro finito. Ma leggeva il numero con uno strumento che a quel punto non è ancora disponibile: non trovandolo, leggeva «niente» e concludeva che il pacchetto avesse il numero sbagliato. Il messaggio mandava a cercare il guasto dalla parte sbagliata — «il pacchetto dice , il rilascio dice 0.23.0» — mentre il pacchetto era a posto e mancava lo strumento. Ora il numero si legge senza dipendere da niente, e se proprio non si riesce a leggerlo il sistema lo dice con quelle parole invece di inventare un colpevole. La 0.23.0 esiste come etichetta ma non è mai stata pubblicata: si è fermata su questo controllo.

## [0.23.0] - 2026-08-21

### Corretto

- **Togliere un prerequisito senza nominarlo non cancella più quello che non puoi vedere.** Se un prerequisito sta in un prodotto che il tuo accesso non vede, il comando ne dice l'esistenza ma non il nome. Quel nome mancante valeva però come nome vuoto: lanciando il comando di rimozione con un prerequisito vuoto, veniva tolto proprio quello nascosto — cioè l'unico di cui non ti saresti accorto. Ora un prerequisito senza nome viene rifiutato prima di toccare qualsiasi cosa, e un nome mancante non combacia più con niente. Vale anche per l'aggiunta, che nello stesso caso diceva «già presente» e usciva bene su un errore vero.

- **Un nome o un'email si ritrovano anche nelle organizzazioni grandi** (CYCL-42): quando si indica

  un team per nome o una persona per email, il comando andava a cercarli in un elenco che il server

  consegna dieci righe per volta — e leggeva solo la prima. L'undicesimo team e l'undicesima persona

  risultavano «non trovati» pur esistendo, e chi ha più di dieci colleghi non poteva aggiungerli a

  un'attività scrivendone l'email. Ora l'elenco viene letto tutto. E quando è un permesso a mancare,

  il rifiuto dice cosa fare — indicare il codice identificativo invece del nome — invece del solo

  «Permesso negato», che sembrava riguardare l'attività e non l'elenco letto per comodità.

- **Il numero del rilascio e quello dentro il pacchetto non possono più divergere** — non li

  confrontava nessuno: il rilascio poteva chiamarsi in un modo e pubblicare un altro numero, senza

  che nulla diventasse rosso. E se quel numero era già uscito, il magazzino rifiutava il rilascio

  buono lasciando il lavoro a metà. Adesso il rilascio si ferma prima di pubblicare, e dice quale

  dei due va aggiornato.

### Aggiunto

- **I prerequisiti fra ticket si scrivono, si rileggono e si tolgono dal terminale.** L'ordine del lavoro lo decidi tu approvando il piano: dici quale ticket viene prima e quale dopo, e finché il primo non è concluso il secondo non parte. Finora l'unico modo di trasferire quell'ordine nel sistema era aprire la pagina di un ticket, scegliere il prerequisito da un menu e premere Aggiungi — un legame, un giro completo di pagina. Per il piano di questo giro vuol dire cinquantacinque volte. E c'era di peggio: quel menu propone solo ticket dello stesso prodotto, mentre dodici di quei cinquantacinque legami uniscono due prodotti diversi. Il sistema li accetta senza problemi, è la pagina che non li propone: dalla pagina, dodici legami su cinquantacinque non si potevano proprio scrivere. Mancava anche il terzo pezzo, rileggere: il terminale sapeva dire che un ticket è bloccato, ma non da chi, quindi dopo cinquantacinque giri a mano non c'era modo di ricontrollare quello che avevi scritto. Ora dal terminale si elencano, si aggiungono e si tolgono. I cinquantacinque legami diventano un file di cinquantacinque righe che parte in un colpo solo, e rilanciarlo è sicuro: un legame già scritto non viene raddoppiato e non fa fallire il lancio, il comando dice che c'era già e va avanti — mentre una riga davvero sbagliata si ferma, dice quale e perché, e non porta giù le altre. I legami fra prodotti diversi diventano possibili nominando il prerequisito col suo codice. Rileggendo vedi codice, titolo e se è già concluso; e se un prerequisito sta in un prodotto che il tuo accesso non vede, il comando dice che c'è e se è concluso ma non ne rivela nome e titolo, esattamente come fa già la pagina. Per chi lavora dalla pagina web non cambia niente.

- **Un account di servizio si guarda e si corregge senza doverlo rifare** (CYCL-46): dalla riga di

  comando si potevano solo creare, elencare ed eliminare gli accessi automatici; per cambiare in

  quali ambienti uno di essi può leggere i segreti, o anche solo per sapere quali chiavi aveva

  ancora in mano, bisognava aprire il sito — oppure cancellarlo e rifarlo, che significa spegnere

  tutto quello che lo stava usando. Ora `service-accounts show <id>` mostra chi è, quante chiavi ha

  attive e il confine dei suoi ambienti, e `service-accounts tokens list <id>` elenca le sue chiavi

  una per una dicendo quali funzionano ancora e quali sono state ritirate, con l'ultima volta che

  sono state usate. Il valore di una chiave non ricompare mai: si vede solo l'inizio, quello che

  serve a riconoscerla, e viene tolto anche dalla risposta per le macchine — una chiave si mostra

  una volta sola, quando nasce.

  `service-accounts update <id> --secret-environment staging` cambia il confine senza toccare

  nient'altro. Qui c'era una trappola che il comando adesso disinnesca: un elenco vuoto di ambienti

  non vuol dire «nessun ambiente», vuol dire **tutti**. Quindi un `update` senza indicazioni non

  parte affatto, e per togliere davvero la restrizione bisogna dirlo con `--all-environments`: così

  nessuno allarga un accesso credendo di non aver cambiato niente. E siccome il server accetta

  soltanto i codici degli ambienti che esistono davvero e scarta gli altri in silenzio, un ambiente

  scritto male lascerebbe l'account senza confine, cioè libero ovunque: ora il comando controlla i

  nomi prima di scrivere e si ferma elencando quelli buoni, senza aver toccato niente. Il controllo

  prima non basta da solo — leggere l'elenco degli ambienti richiede un permesso che chi gestisce gli

  accessi può non avere, e un ambiente può sparire nel frattempo — quindi resta anche quello dopo: il

  comando confronta ciò che ha chiesto con ciò che è stato applicato, in tutti e due i versi (un

  ambiente sparito, o uno comparso che nessuno aveva chiesto), scrive quale confine è in vigore

  adesso ed esce con errore se non sono la stessa cosa. Progetti, gruppi e ruoli restano fuori: il

  server li cambia con scritture separate, e un permesso applicato a metà sarebbe peggio di nessun

  cambiamento.

- **Dopo un rilascio rumoroso gli errori si ripuliscono dal terminale, non uno alla volta**

  (CYCL-44): quando un rilascio sbagliato produce trenta gruppi d'errore quasi identici, dalla riga

  di comando si poteva solo chiuderli a uno a uno, e i duplicati restavano lì perché fonderli si

  poteva soltanto dal sito. Ora `errors bulk-triage` chiude, silenzia o riapre tutti i gruppi

  indicati in un colpo, e `metrics bulk-triage` fa lo stesso con le query e i metodi lenti. Se il

  server non restituisce tutti i gruppi chiesti — un identificativo di un altro progetto viene

  scartato senza dire niente — il comando elenca quelli rimasti fuori ed esce con errore, invece di

  far credere che siano stati sistemati tutti; gli altri restano cambiati, perché disfare la parte

  riuscita sarebbe peggio, ma nessuno se lo sente dire a cose fatte. `errors merge` fonde i

  duplicati dentro un gruppo che tiene tutto: le occorrenze si spostano, i conteggi si sommano, i

  gruppi assorbiti spariscono. È irreversibile e chiede `--confirm`; gli identificativi partono

  esattamente come sono stati scritti, così basta che uno non sia di quel progetto perché la

  fusione non parta affatto e nessun gruppo resti modificato a metà. `errors split` fa il gesto

  opposto — stacca alcune occorrenze in un gruppo nuovo, con la stessa regola del tutto-o-niente —

  ed `errors delete --confirm` cancella per sempre un gruppo con tutte le sue occorrenze.

  `errors assign` mette l'errore nelle mani di una persona, indicata per email o per

  identificativo, e `--unassign` lo lascia a nessuno: se quella persona non fa parte

  dell'organizzazione il server rifiuta in silenzio e lascia l'errore senza nessuno, quindi il

  comando controlla la risposta e lo dice invece di annunciare un'assegnazione mai avvenuta.

  Infine `errors grouping-rules` porta sul terminale le regole con cui un progetto piega il

  raggruppamento automatico: `list` le mostra nell'ordine in cui vengono applicate, `create` ne

  aggiunge una (quale campo guardare, come confrontarlo, sotto quale chiave far confluire ciò che

  combacia), `update` la corregge o la spegne senza cancellarla, `delete --confirm` la toglie

  lasciando dov'erano i gruppi che aveva già formato.

- **Le richieste di modifica ai segreti si decidono dal terminale** (CYCL-40): quando un segreto vive

  in un ambiente protetto, la modifica non parte da sola — resta in attesa che una seconda persona la

  guardi. Quella coda esisteva già, ma si poteva leggere e decidere soltanto dal sito: per approvare

  una riga bisognava interrompere il lavoro e aprire il browser. Ora `vault requests list` mostra

  tutto quello che aspetta, su tutti i progetti che si vedono — chi ha chiesto cosa, su quale

  progetto e quale ambiente, se è una modifica o una cancellazione, e da quando è lì. Il valore

  proposto non compare mai, né a schermo né in `--json`: una richiesta si giudica dal nome e

  dall'intento, mai leggendo il segreto. `vault requests approve <id>` applica la modifica,

  `vault requests reject <id> --reason "..."` la congela senza toccare niente nel vault. Il motivo

  del rifiuto è obbligatorio e non può essere fatto di soli spazi: il rifiuto chiude la pratica per

  sempre, e a chi aveva chiesto resta solo quella frase per capire cosa correggere. I quattro modi in

  cui una decisione può essere respinta non si assomigliano più: la propria richiesta non si approva

  da soli e il comando dice di passarla a un collega; una chiave di servizio non decide mai al posto

  di una persona e il comando dice di usare il proprio accesso; una richiesta già decisa da qualcun

  altro rimanda a rivedere la coda; un motivo vuoto viene fermato prima ancora di partire.

- **Dal terminale si vede quale contesto è stato davvero consegnato alla presa in carico**

  (CYCL-47): il sistema fotografa i riferimenti e le procedure dati a chi prende in carico un

  ticket, ma finora quella fotografia si poteva leggere solo dal sito — dalla riga di comando si

  vedeva la configurazione di oggi, che nel frattempo può essere cambiata, e un controllo finiva per

  giudicare il lavoro con istruzioni che al momento del lavoro non c'erano. Ora `tickets

  work-context DRFL-3 -p acme-api` mostra la copia congelata: quando è stata scattata, a chi, con

  quale firma, e l'elenco dei riferimenti e delle procedure di allora. Il comando non ripiega mai

  sulla configurazione corrente — se serve quella, resta `guidance show`. Con `--full` stampa anche

  il testo integrale delle istruzioni congelate; `--json` lo restituisce sempre per intero. La

  fotografia la scatta soltanto la presa in carico automatica, quella in cui una macchina pesca il

  ticket dalla coda: un ticket preso in carico a mano non ne ha una, e il comando lo dice con

  parole sue invece di rispondere «non trovato», che farebbe pensare a un ticket sbagliato. La

  lettura resta materiale di controllo: senza quel permesso il comando lo scrive a chiare lettere

  invece di limitarsi a «permesso negato».

- **Una pagina di conoscenza tiene insieme tutti i suoi ambiti, i suoi tag e i suoi allegati anche

  dal terminale** (CYCL-45): una procedura che vale per tre progetti, o per un intero gruppo, dalla

  riga di comando nasceva legata a uno solo — gli altri collegamenti si aggiungevano poi dal sito, a

  mano. Ora `kb create` accetta `--project`, `--group` e `--tag` ripetuti quante volte servono, così

  la pagina nasce già completa: `kb create -p acme-api -p billing --group Piattaforma --tag deploy

  --title "Rollback" --body-file ./nota.md`. Una pagina che segue un gruppo intero può ora nascere

  senza nominare alcun progetto: basta il gruppo, e i progetti che ci entreranno domani se la

  troveranno collegata. Lo stesso vale per `kb update`, con una regola che vale la pena conoscere:

  indicare progetti, gruppi o tag **sostituisce** l'elenco con quello che si scrive, mentre non

  indicarli lascia tutto com'era — correggere una virgola nel testo non scollega più niente, e per

  togliere i tag c'è la forma esplicita `--tag ""`. Vale anche al contrario: cambiare i soli

  collegamenti o i soli tag non riscrive il testo, quindi non cancella la modifica di chi stava

  scrivendo nello stesso momento. `kb show` di conseguenza non

  mostra più solo il primo progetto: elenca tutti gli ambiti della pagina e i suoi tag. I file

  allegati, che finora si potevano gestire solo dal sito, hanno i loro quattro comandi: `kb

  attachments` li elenca tutti — non i primi cento — dicendo anche quali sono script, `kb attach

  --file ./rollback.sh` ne carica uno o più in una volta sola (se un percorso è sbagliato non ne

  carica nessuno), `kb attachment-download` li salva sul disco, sempre dentro la cartella che si è

  scelta, e `kb detach --confirm` li elimina. Infine

  `--author-origin` dichiara chi ha scritto davvero il testo — l'assistente o la skill — che non è

  la persona a cui appartiene la chiave usata per scrivere.

- **L'assistente e «chiedi ai ticket» si usano dal terminale** (CYCL-43): la parte server c'era già

  da tempo, ma dalla riga di comando non si poteva né parlare con l'assistente né interrogare i

  ticket a parole — per farlo serviva scrivere un programma apposta. Ora `assistant ask "quanti

  ticket aperti ha acme-api?"` pone la domanda e aspetta la risposta, che arriva insieme all'elenco

  degli strumenti che l'assistente ha consultato: si vede su cosa si fonda invece di crederci sulla

  parola. Il filo del discorso non si perde: il comando stampa l'identificativo della conversazione

  e `--conversation <id>` continua a chiedere lì dentro. `assistant conversations list` mostra le

  conversazioni con l'attività più recente in cima, `assistant conversations show` le rilegge per

  intero, `assistant conversations create` ne apre una vuota e `assistant conversations delete

  --confirm` la cancella per sempre, domande e risposte comprese. `tickets ask "cosa manca al

  prossimo rilascio?"` fa lo stesso sui ticket visibili — tutti i progetti insieme, senza indicarne

  uno — e cita quelli su cui la risposta si appoggia. L'attesa non è mai infinita e non martella il

  server: le richieste si diradano man mano, e allo scadere di `--timeout` (tre minuti se non si

  dice altro) il comando si ferma spiegando dove ritrovare la risposta rimasta indietro: per

  l'assistente basta rileggere la conversazione, per i ticket serve rifare la domanda dandole più

  tempo, perché ripeterla subito ne farebbe partire una seconda invece di raccogliere la prima. Quando invece la risposta non arriverà, il

  messaggio distingue i tre casi che chiedono reazioni diverse: il servizio non è collegato — e

  finché qualcuno non lo collega non cambierà niente —, la domanda non è stata capita e va

  riformulata, oppure è un intoppo momentaneo e conviene riprovare. Con `--json` restano nel

  risultato lo stato, le fonti, gli strumenti usati e l'eventuale errore.

- **Il carico di lavoro si gestisce dal terminale** (CYCL-42): le attività non tecniche di un team

  — una fiera, un incontro, la preparazione del materiale — si potevano registrare solo dal sito,

  benché la parte server per la riga di comando ci fosse già. Ora `workload list` mostra quelle dei

  team di cui si fa parte, con stato, persone coinvolte, date e l'eventuale ticket collegato, e

  `workload show` apre la singola attività con i nomi dei partecipanti. `workload create --team

  Marketing --title "Fiera di Rimini"` la crea, `workload update` ne cambia solo i campi indicati e

  `workload delete --confirm` la toglie — la conferma è obbligatoria perché non si torna indietro, e

  un ticket già collegato sopravvive perdendo solo il collegamento. Le persone si gestiscono una per

  una con `workload participant add|remove`, indicandole per email: chi non è nel team viene

  rifiutato con un messaggio, non aggiunto a metà. Un ticket esistente si lega scrivendolo come lo si

  legge (`--ticket DRFL-3`) invece di andarne a cercare il codice interno, e `--ticket ""` lo

  scollega; se il ticket indicato non è visibile, il comando lo dice invece di lasciar credere che il

  legame ci sia. Infine `workload promote <attività> --project acme-api` genera il ticket vero e

  proprio a partire dall'attività e lo collega. Le attività di un team a cui non si appartiene

  restano invisibili: il server risponde «non esiste», e il comando riporta quella risposta tale e

  quale.

- **Le variabili segrete condivise si gestiscono dal terminale** (CYCL-41): si potevano già

  impostare dal sito, e la parte server per la riga di comando c'era da tempo, ma il comando non

  esisteva: chi lavora dal terminale doveva aprire il browser. Ora `shared list` elenca le variabili

  dell'organizzazione — nome, descrizione, ultimo aggiornamento — pescando tutte le pagine, non solo

  la prima, e senza mostrare mai i valori. `shared set -e production NOME=valore` ne imposta una su

  un ambiente, e i progetti a cui è stata delegata su quell'ambiente leggono subito il nuovo valore;

  la conferma dice nome e ambiente, mai il valore. `shared delete NOME --confirm` la toglie: qui la

  conferma è obbligatoria perché non esiste una cancellazione «solo su produzione» — la variabile

  sparisce da tutti gli ambienti in un colpo solo, e sia il rifiuto senza conferma sia il messaggio

  finale lo dicono a chiare lettere. Un ambiente scritto male o un permesso mancante fanno arrivare

  intero il messaggio del server invece di un errore generico.

||||||| 336e656

### Sicurezza

- **Solo versioni definitive arrivano a chi installa lo strumento** — chi lo installa senza chiedere

  un numero preciso riceve quella che il magazzino pubblico segna come «l'ultima buona». Finora

  bastava un'etichetta di prova per far partire la pubblicazione vera: il commento sopra al lavoro

  diceva «solo versioni definitive», la regola scritta accettava qualunque etichetta che cominciasse

  per `v`. Non è mai successo solo perché i rilasci li ha fatti una persona a mano.

## [0.22.0] - 2026-08-16

### Aggiunto

- **La scheda di un sito sotto controllo SEO si apre dal terminale** (CYCL-36): i siti si potevano
  elencare, dichiarare, modificare e togliere, ma non guardare uno per uno: per sapere com'era
  messo un sito bisognava leggerne la riga in tabella e poi indovinare il resto. Ora
  `seo-sites show <id>` risponde in un colpo solo alle quattro domande che contano: com'è
  configurato (indirizzo, ogni quanto si controlla, quante pagine visita, quando tocca di nuovo),
  quanti problemi ha aperti, com'è andato l'ultimo giro e quanto è veloce. I blocchi che il server
  non manda non compaiono affatto — né come intestazione vuota, che si leggerebbe come «qui non c'è
  niente», né come riga vuota in mezzo alle impostazioni. Se il server aggiunge un
  blocco nuovo, il comando lo mostra lo stesso invece di buttarlo via, e `--json` resta quello che
  arriva dal server, parola per parola. Il comando parla con la parte server introdotta da
  CYRA-541: senza quella, risponde con l'errore del server.

## [0.21.0] - 2026-08-15

### Aggiunto

- **Una fonte di conoscenza si pubblica dal terminale e si può ripubblicare** (CYCL-8): per tenere
  aggiornata una pagina da un'automazione bisognava prima cercarla, poi decidere se crearla o
  modificarla, e un tentativo interrotto a metà lasciava doppioni. Ora `kb publish` fa tutto in un
  colpo solo: si dà un nome stabile alla fonte con `--publication-key`, e da lì in poi lo stesso
  comando ripetuto atterra sempre sulla stessa pagina. La risposta dice se la pagina è nata adesso
  o è stata aggiornata, così chi lancia il comando lo sa senza andare a controllare. Il testo si
  passa con `--body` o si legge da un file con `--body-file`: uno dei due, mai nessuno e mai
  entrambi. Chi non indica il tipo non lo cambia — una guida resta una guida — e una pagina nuova
  nasce come nota. Un nome di fonte scritto male, un titolo o un testo troppo lunghi vengono
  respinti prima di partire, dicendo cosa non va. Se il server è più vecchio di questa funzione il
  comando lo dice apertamente, invece di far sembrare sparito il progetto.

- **I book della base di conoscenza si guidano dal terminale** (CYCL-7): i comandi che le
  automazioni chiamavano non esistevano, quindi un book si poteva leggere e comporre solo dal sito.
  Ora `kb book list` elenca i book dei progetti che vedi — con l'id già in tabella, così da lì si
  passa direttamente agli altri due — e si restringe con `--project` o cercando nel titolo con
  `--q`. `kb book show` apre il sommario: ogni pagina con la sua posizione, che parte da 0.
  `kb book add-page` mette una pagina nel sommario, in fondo oppure al posto indicato da
  `--position`, che conta come il sommario stesso: `0` è la cima. Ripetere lo stesso comando non elenca mai la stessa pagina due
  volte, quindi un'automazione che non sa se il tentativo precedente è andato a buon fine può
  rilanciarlo senza rovinare l'indice. Un numero di pagina o una posizione senza senso vengono
  respinti subito, con scritto cosa non va, invece di partire e riportare dati plausibili ma
  sbagliati.

## [0.20.0] - 2026-08-15

### Aggiunto

- **Il controllo SEO dei siti si guida da terminale** (CYRA-528): `seo list` elenca i problemi
  trovati su tutti i siti visibili — il più grave in cima — e stampa l'id, così da lì si passa
  direttamente a `seo ignore`, `seo reopen` o `seo promote` senza rileggere con `--json`.
  `seo show` apre la prova in un blocco a sé: quale indirizzo, cosa c'era, cosa ci doveva essere.
  `seo pages` mostra com'è messa ogni pagina visitata e dice `missing` dove manca il titolo
  principale. I siti si governano con `seo-sites list|create|update|delete`, e `seo rescan --site`
  fa ripartire il controllo subito invece di aspettare il giro programmato. Un sito il cui ultimo
  giro è fallito non mostra la data come se fosse andato bene: dice che è fallito e perché.
- **`--event-type` accetta il nuovo avviso SEO**: `seo_issue_new` era già valido sul server e la
  CLI lo avrebbe rifiutato, come era successo con gli altri tipi aggiunti dopo l'elenco.
- **Il resoconto di una lavorazione si scrive dal terminale** (CYCL-31): il testo lungo di fine
  lavorazione non aveva posto dove stare — il commento si ferma a 240 caratteri e il rifiuto
  rimandava a un campo che dal terminale non esisteva, quindi il resoconto andava riscritto a mano
  dal sito oppure non veniva scritto. Ora `tickets report` lo salva per intero, passandolo con
  `--body` o leggendolo da un file con `--body-file`. Ogni scrittura aggiunge una versione e non
  cancella la precedente: `tickets report-show` mostra quella corrente (o una passata, con
  `--version`), `tickets report-versions` elenca la cronologia dalla più recente. Riscrivere lo
  stesso identico testo non crea una versione in più, quindi ripetere il comando non sporca la
  cronologia. E il commento troppo lungo non rimanda più a un posto che dal terminale non esiste:
  il rifiuto stampa il comando pronto da eseguire, col ticket e il progetto già scritti dentro.

### Corretto

- **Aprire un ticket non chiede più due codici che l'aiuto dava per facoltativi** (CYCL-34): stato e
  priorità comparivano fra parentesi quadre, cioè come se si potessero omettere, ma senza di loro la
  creazione veniva rifiutata con un messaggio che parlava di dati inesistenti; per farla passare
  bisognava prima elencare stato e priorità con due comandi a parte e ricopiare due codici lunghi.
  Ora chi non li indica ottiene comunque il ticket, aperto e a priorità media, e chi li vuole
  diversi li scrive come li legge: `--status in_progress` o `--status "In Progress"`, `--priority
  High`. Un codice continua a funzionare dov'era, e i vecchi `--status-id` e `--priority-id` restano
  validi, quindi gli script già scritti non vanno toccati. Lo stesso vale quando si cambia il
  ticket (`tickets update`), quando se ne cambia solo lo stato (`tickets status`) e quando nasce da
  un'idea (`ideas convert`). Se il nome scritto non esiste, il comando si ferma prima di creare
  qualcosa ed elenca i nomi buoni, così non serve un secondo comando per scoprirli.
- **Quanto può essere lungo un testo si legge prima di scriverlo** (CYCL-32): i limiti di lunghezza
  si scoprivano solo sbagliando — l'aiuto dei comandi non li nominava e il rifiuto arrivava a testo
  già scritto, uno per volta: si accorciava il corpo della pagina, si riprovava, e solo allora
  usciva che era troppo lunga anche la parte tecnica. Ora ogni campo con un tetto lo dichiara nel
  proprio aiuto (`--help`): corpo di una pagina o descrizione di un ticket 4000 caratteri, parte
  tecnica e analisi tecnica 1500, titolo 255, nota di revisione e commento 240, resoconto di
  lavorazione 20000. E il controllo avviene prima di spedire: se i campi troppo lunghi sono più di
  uno, il comando li elenca tutti insieme, con la lunghezza di ciascuno e il suo limite, senza
  chiamare il server — anche quando il ticket nasce da un'idea, dove il controllo arriva prima dei
  trenta secondi di scrittura assistita, non dopo. Chi ha una pagina o un ticket scritti prima che
  il limite esistesse può continuare a correggerli: il testo già oltre soglia si blocca solo se si
  allunga.
- **Cambiare un campo di un ticket non cancella più gli altri** (CYCL-30): `tickets update`
  sostituiva il ticket intero con quello che gli si passava, quindi cambiare il titolo svuotava
  descrizione, analisi tecnica, peso, scadenza, assegnatario, traguardo e piattaforme; e senza
  ripassare stato e priorità il comando non partiva nemmeno («Priority must exist»). Ora legge il
  ticket e rimanda com'era tutto ciò che non è stato nominato: cambia solo quello che si scrive.
  Per svuotare un campo lo si chiede a parte, con `--clear <campo>` (descrizione, analisi tecnica,
  peso, scadenza, assegnatario, traguardo, epica, piattaforme), e chiedere insieme di scrivere e
  svuotare lo stesso campo viene rifiutato. Chi vuole la sostituzione totale di prima la chiede con
  `--replace`. Se un aggancio attuale non è più riconoscibile (assegnatario, traguardo o
  piattaforma con più corrispondenze o nessuna), il comando si ferma prima di scrivere e dice quale
  opzione passare, invece di cancellarlo in silenzio. Scenari e condizioni non cambiano
  comportamento: restano come sono finché non se ne passano di nuovi, che li sostituiscono.
- **Con `--json` l'errore dice cosa manca, non «Command failed»** (CYCL-33): chiedendo la risposta
  in formato JSON, qualunque comando incompleto tornava lo stesso messaggio generico
  (`C500-SYS-001`, «Command failed»), come se fosse guasto il server, mentre senza `--json` lo
  stesso comando spiegava esattamente cosa mancava. Ora una riga di comando da correggere torna
  `C400-INP-001` con il messaggio per esteso — `Missing required flag project`, `Nonexistent flag:
  --nope`, `Refusing to delete without --confirm` — e il codice generico resta ai guasti veri.
- **Un'opzione scritta male non viene più ignorata** (CYCL-33): `whoami`, `logout`, `org show`,
  `alerts preferences show` e `alerts notifications read-all` non controllavano affatto la riga di
  comando, quindi un'opzione inesistente passava in silenzio e il comando rispondeva come se fosse
  tutto a posto — `logout` cancellava comunque le credenziali. Ora si fermano e dicono qual è
  l'opzione sbagliata, come tutti gli altri comandi.

## [0.19.0] - 2026-08-13

### Aggiunto

- **I contenitori da ignorare di una macchina si leggono e si scrivono da terminale** (CYRA-519):
  `servers ignored-containers <id>` stampa l'elenco dei nomi che quella macchina non considera
  servizi; `--set buildkit,runner` lo sostituisce, `--clear` lo svuota. Prima quel campo si compilava
  solo dalla pagina web, e chi lavora da terminale doveva aprire il browser per una lista di due
  righe. Un aggiornamento parziale non tocca gli altri campi della macchina.

### Corretto

- **`--event-type` accetta di nuovo tutti i tipi di avviso** (CYRA-519): l'elenco si era fermato ai
  primi quindici, quindi `alerts create` e `alerts update` rifiutavano ogni tipo aggiunto dopo —
  contenitori, replica, inode, automazione, vulnerabilità. Il comando sembrava rotto mentre il
  server li accettava. Ora sono tutti e 43, nello stesso ordine del server.

## [0.18.0] - 2026-08-11

### Aggiunto

- **Le vulnerabilità delle dipendenze da terminale** (CYCL-29): nuovo gruppo `vulnerabilities`
  (abbreviabile in `vulns`). `list` è cross-progetto come `logs list` — senza `--project` copre tutti
  i progetti visibili, ordinati dalla gravità più alta, e filtra per `--severity`, `--status`,
  `--package`. `show` stampa advisory, pacchetto, manifest e la versione che risolve; `ignore`
  (con `--note`), `reopen` e `promote` fanno il triage; `rescan --project` fa ripartire la scansione
  senza aspettare il giro notturno; `runtimes` elenca le versioni di linguaggio fuori supporto.
  Le mutazioni richiedono `vulnerabilities.triage` sul progetto della riga; una riga di un progetto
  che non vedi resta un 404, non un 403.

## [0.17.1] - 2026-08-10

### Corretto

- **L'indirizzo del server passato al volo viene rispettato** (CYCL-15): `CLOSEYOURIT_API_URL` ora
  vince sull'`apiUrl` già salvato in configurazione, invece di essere ignorato appena un indirizzo
  era stato memorizzato una volta. L'override vale per il comando in corso e non viene mai
  persistito su disco: la configurazione salvata resta quella scelta con `login`.
- **L'elenco dei comandi distribuito torna aggiornato** (CYCL-16): `opencli.json` viene rigenerato
  dal manifest oclif in `prepack`, così la descrizione dei comandi pubblicata col pacchetto segue la
  versione pubblicata invece di restare ferma a undici versioni fa.

## [0.17.0] - 2026-08-09

### Aggiunto

- **Proporre una pagina della knowledge invece di pubblicarla** (CYCL-17): `kb create --in-review`
  crea la pagina in attesa di revisione, con `--review-note` per la riga che spiega perché vale la
  pena tenerla. Finché aspetta non compare nelle ricerche, nelle risposte e nei suggerimenti a lato
  dei ticket: decide una persona, dalla pagina Revisione del sito.
- **Vedere cosa aspetta e cosa manca**: `kb list --status in_review` mostra la coda delle proposte
  (`published`, `rejected` e `all` per gli altri casi), e `kb list --awaiting-consolidation` elenca
  le pagine già accettate che non sono ancora state scritte fra i documenti del repository. La
  colonna dello stato compare solo quando serve, così l'elenco di sempre resta identico.
- **Registrare dove è finito il documento**: `kb consolidate <id> --path <percorso>` segna una pagina
  accettata come archiviata e tiene traccia del file che la contiene.

## [0.16.0] - 2026-08-07

### Aggiunto

- **Presa in carico dei ticket con scadenza** (CYCL-14): `tickets lease claim` prenota un ticket a
  tuo nome per un tempo limitato (di default 8 ore), così due persone o due agenti automatici non ci
  lavorano sopra insieme senza saperlo. `tickets lease renew` allunga la prenotazione prima che scada,
  `tickets lease release` la libera quando hai finito. Se il ticket è già prenotato da qualcun altro,
  il comando si ferma con un errore che dice chi lo tiene e fino a quando — utile soprattutto per gli
  script, che possono passare al ticket successivo invece di aspettare a vuoto.

## [0.15.0] - 2026-08-03

### Aggiunto

- **La tabella delle funzionalità si usa da terminale** (CYCL-13): `matrix show <prodotto>` stampa
  quali funzionalità esistono e a che punto sono su ogni piattaforma, con la versione da cui sono
  arrivate agli utenti. Una casella vuota è un trattino; una funzionalità data per disponibile ma
  senza versione è segnata con un punto interrogativo, e in fondo trovi quante sono. Da qui si
  gestisce anche tutto il resto: `matrix categories` per i gruppi di funzionalità, `matrix features`
  per le funzionalità, `matrix cells set` per dire a che punto è una funzionalità su una
  piattaforma. Una funzionalità si richiama come la vedi scritta, per esempio `"Accesso/2FA"`.
  `matrix statuses` elenca gli stati che puoi usare. Cancellare qualcosa chiede sempre conferma.

## [0.14.0] - 2026-08-01

### Aggiunto

- **Gli elenchi dicono quante pagine ci sono** (CYCL-11): prima ogni elenco mostrava le prime dieci
  righe e si fermava lì senza dirlo — su un progetto con centinaia di ticket sembravano tutti. Ora,
  quando la pagina che vedi non è l'ultima, in fondo compare una riga che te lo dice e ti indica come
  chiedere la successiva. La riga esce una volta sola, solo nell'output per le persone: con `--json`
  non cambia nulla, e i comandi che raccolgono già tutte le pagine da soli non stampano niente. Il
  suggerimento appare solo sui comandi che hanno davvero `--page`, mai su quelli che non ce l'hanno.

## [0.13.0] - 2026-07-31

### Modificato

- **Tipi di ticket standard**: `--kind` accetta ora `bug`, `story`, `task` ed `epic`. I vecchi nomi
  `feature` e `improvement` non esistono più: uno script che li passa riceve un errore invece di
  creare un ticket sbagliato in silenzio. Vale anche per `ideas convert --kind`, il cui default
  diventa `story`.
- **`--roadmap-enabled` rimosso** da `projects create`, `projects update`, `projects settings update`,
  `groups create` e `groups update`. La roadmap non è più una funzione da accendere: ce l'hanno tutti
  i progetti, quindi il flag non aveva più niente da governare.

### Aggiunto

- **`tickets create|update --parent-id`**: aggancia il ticket a un'epic dello stesso progetto.
  Passando una stringa vuota lo stacca.

## [0.12.0] - 2026-07-29

### Aggiunto

- **`tickets eligibility`**: decidi da terminale se un ticket può essere lavorato dagli agenti che
  lavorano da soli — `--allow` per permetterlo, `--block` per tenerlo a una persona, `--auto` per
  tornare alla valutazione automatica, con `--reason` per scrivere il perché. Senza nessuna di queste
  scelte il comando non fa nulla: non c'è un comportamento predefinito, così una svista di
  digitazione non può aprire il cancello su un ticket che volevi tenerti.
- **`tickets list --agent-eligibility`**: filtra l'elenco per stato del cancello, e una colonna
  AGENTS dice a colpo d'occhio quali ticket gli agenti possono prendere.
- **`tickets show`** mostra il verdetto, chi l'ha deciso e soprattutto la motivazione — è quella che
  serve per capire se ribaltarlo.

## [0.11.0] - 2026-07-28

### Removed

- **Comandi degli agenti automation**: `agents list`, `show`, `create`, `update`, `assign`, `delete` e
  `agents runs` non esistono più. CloseYourIt non ha più un catalogo di agenti da gestire: l'unità che lavora
  è la macchina registrata, che si vede e si certifica dal sito. Restano `agents tokens`, che servono a
  registrare una macchina nuova.

## [0.10.0] - 2026-07-27

### Aggiunto

- **Guidance nel ticket e nuovo `guidance show`**: `cyi tickets show` mostra ora le references e le procedure effettive del progetto; il nuovo comando `cyi guidance show -p <progetto>` le consulta direttamente. (CYCL-2)
- **`projects show` più informativo**: elenca gli ambienti dichiarati del progetto e le capabilities attive per ciascuno, così puoi consultarli prima di modificarli con `set-environments`. (CYCL-4)
- **Sezione tecnica in `kb show`**: `cyi kb show` mostra ora anche la sezione tecnica (`tech_spec`) delle pagine della knowledge base. (CYCL-9)
- **`secrets list --all`**: elenca esplicitamente tutti i secret di un ambiente senza troncamento silenzioso ai primi 10. (CYCL-5)

### Migliorato

- **`projects github`**: mostra lo stato della sincronizzazione dei secret (`sync_secrets`) del progetto. (CYCL-3)

## [0.9.0] - 2026-07-26

### Aggiunto

- **Sezione tecnica nella knowledge base da CLI**: `kb create` e `kb update` accettano ora `--tech-spec` (testo inline) e `--tech-spec-file` (da file), speculari a `--body`/`--body-file`, per scrivere il campo `tech_spec` di una pagina — la parte tecnica tenuta separata dal corpo semplice. Su `kb update` il valore corrente della sezione tecnica viene preservato quando non passi il flag (merge parziale come per gli altri campi). Il backend accettava già `tech_spec` su `POST`/`PUT /cli/v1/knowledge/pages`.

## [0.8.0] - 2026-07-25

### Aggiunto

- **Pagine collegate nella knowledge base**: nuovo `cyi kb related <id>`, più `--related`/`--question` su `kb show`, `--with-related` su `kb search` e un blocco «Related» in coda a `kb ask`. Mostrano cosa leggere dopo una pagina: quello che cita con `[[collegamenti]]`, chi la cita e le pagine vicine per significato. Con `--question` restano solo quelle inerenti alla domanda, ordinate per pertinenza. (CYRA-144)

## [0.7.3] - 2026-07-14

### Corretto

- **Contratto `--json` di `secrets list`, `secrets assets list` e `secrets assets shared-list`**: l'aggregazione di tutte le pagine restituiva `{data}` senza `meta`, rompendo gli script che leggono l'envelope. Ora l'envelope conserva un `meta` coerente con l'aggregato (`page: 1`, `per`/`total` = numero elementi, `total_pages: 1`) invece del `meta` di pagina 1, che dopo l'aggregazione descriveva male i dati. Regressione introdotta con l'aggregazione delle pagine in 0.7.1/0.7.2.

## [0.7.2] - 2026-07-14

### Corretto

- **Compatibilità `secrets assets list`**: ripristinati i flag `--page`/`--per` (ora deprecati e ignorati; la lista aggrega comunque tutte le pagine). La 0.7.1 li aveva rimossi, rompendo gli script che li passavano.

## [0.7.1] - 2026-07-14

### Corretto

- **Elenco secret completo**: `cyi secrets list` e `cyi secrets assets list` ora aggregano tutte le pagine e mostrano tutti gli elementi, non più solo i primi. Prima veniva letta solo la prima pagina (10 per default), falsando i conteggi.

## [0.7.0] - 2026-07-13

### Aggiunto

- **`--sync-secrets` in `projects github-update`**: attiva/disattiva da CLI il push dei secret del vault sui GitHub Environment secrets (`SECRETS_JSON`), prima possibile solo dalla scheda web del progetto. Sblocca la configurazione della sincronizzazione secret su più progetti in serie. (CYCL-3)

## [0.6.0] - 2026-07-13

### Aggiunto

- **`cyi tickets statuses` e `cyi tickets priorities`**: elencano gli status e le priority dei ticket a livello di organizzazione (`ID | CODE | LABEL`, `--json` per il payload completo) dagli endpoint `/cli/v1/types/ticket_statuses|ticket_priorities`. Restituiscono gli id che `tickets create --status-id/--priority-id` richiede (obbligatori) e che prima non erano scopribili dalla CLI.

## [0.5.0] - 2026-07-13

### Aggiunto

- **`--preview-environment-id` in `projects github-update`**: mappa l'environment di anteprima del progetto allo slot "preview" della sincronizzazione secret verso GitHub, per gli ambienti di anteprima effimeri per pull request. (CYRA-86)

## [0.4.0] - 2026-07-12

### Aggiunto

- **`cyi tokens provision`**: genera e distribuisce un token ingest nel vault destinatario senza
  mostrarne il valore; `tokens provisions show/retry` espongono stato e retry secret-free. Tutti i
  comandi blind ricostruiscono l'output da una allow-list anche se il backend restituisse campi
  sensibili per errore. Il comando umano `tokens create` resta reveal-once. (CYRA-94)

## [0.3.0] - 2026-07-12

### Aggiunto

- **`cyi personal`**: vault di secret personale per-utente (`list`, `get`, `set`, `delete`,
  `download`, `import`, `run`), indipendente da progetto e ambiente. `cyi personal run -- <cmd>`
  inietta le variabili personali come env e `use_cyi_personal` (direnv) le carica in shell, come i
  personal secrets di Doppler. (CYRA-92)

## [0.2.1] - 2026-07-12

### Sicurezza

- **Redazione token**: gli errori diagnostici `--json` non serializzano più lo stato interno o la
  configurazione oclif; `cyi whoami` restituisce soltanto campi allow-listed e il prefisso del token.

## [0.2.0] - 2026-07-12

### Aggiunto

- **`cyi projects github-connect`**: collega un progetto a un repository GitHub usando `owner/name`;
  il backend accetta esclusivamente repository realmente visibili alla GitHub App dell'organizzazione.

## [0.1.0] - 2026-07-12

### Aggiunto
- **`cyi projects github-map [--connected-only]`**: espone in formato tabellare o JSON il mapping completo
  tra progetti CloseYourIt visibili e repository GitHub collegati (`project_key`, `full_name`, branch di
  default), aggregando automaticamente tutte le pagine per gli orchestratori multi-repository.
- **Capability per-ambiente (servers/uptime/secrets)**: `cyi environments create/update` accettano
  `--servers`/`--uptime`/`--secrets` (con le forme `--no-*`) per i DEFAULT dell'ambiente; nuovo comando
  `cyi projects set-environment-capabilities -p KEY -e ENV --uptime off --secrets inherit` per gli
  OVERRIDE tri-state (`inherit|on|off`) di un ambiente del progetto
  (`PUT /cli/v1/projects/:id/environments/:env/capabilities`).

- **Manifest OpenCLI**: allineato ai comandi environment/capability e al nuovo mapping GitHub.

## [0.0.27] - 2026-07-11

### Aggiunto
- **`cyi secrets assets`**: file sensibili mobili cifrati e versionati (`list`, `upload`, `download`,
  `versions`, `rollback`, `archive`, `purge`). Il download richiede `--output`, usa permessi `0600` e
  non sovrascrive senza `--force`; `shared-list/shared-upload/delegate/undelegate` gestiscono gli asset
  organizzativi senza duplicazioni. Nessun contenuto viene stampato o incluso nei bundle ENV.

## [0.0.26] - 2026-07-09

### Aggiunto
- **Token non-interattivo via `CLOSEYOURIT_TOKEN`**: se impostata, l'env sovrascrive il token salvato in
  `config.json` (sovrascrive anche il login device-flow). Abilita l'uso **headless/CI/agenti** con un
  token utente `cyi_u_` (es. di un service account) senza login interattivo:
  `CLOSEYOURIT_TOKEN=cyi_u_… cyi secrets bundle -p KEY -e development`.
- **`cyi service-accounts`** — gestione dei service account (membri di tipo AI, CLI-only) da terminale:
  `list`, `create` (con `--project`/`--group`/`--role`, `--grant-secrets`, `--secret-environment`),
  `delete --confirm`, e `tokens create <account> <name>` (segreto `cyi_u_` reveal-once) / `tokens revoke
  <account> <id> --confirm`. Consuma `/cli/v1/service/accounts` (gate `members.manage`).

### Aggiornato
- `opencli.json` aggiornato coi comandi `service-accounts` e allineato alla versione (`info.version` 0.0.26).

## [0.0.25] - 2026-07-09

### Aggiunto
- **`cyi secrets import` legge da stdin** quando `--from-file` è assente (default). Abilita la migrazione
  one-shot da Doppler: `doppler secrets download --config production --no-file --format json | cyi secrets
  import -p PRJ -e production --format json`.

## [0.0.24] - 2026-07-09

### Aggiunto
- **`cyi secrets sync -p <prj>`** — enfila il push dei secret del vault sui **GitHub Environment secrets**
  del repo connesso (Fase 2, equivalente del bottone "Sync now" nella tab GitHub). Richiede il permesso
  `github.manage`. Il sync gira in background lato server (**delete-only-managed**: non tocca MAI i secret
  impostati a mano, es. `KAMAL_*`). Richiede closeyourit-rails con il push sync GitHub della Fase 2.

## [0.0.23] - 2026-07-09

### Aggiunto
- **`cyi secrets` + `cyi run` — vault di variabili d'ambiente cifrate (sostituto Doppler, Fase 1)**. Nuovo
  topic `secrets`: `set` (`NAME=VALUE` o `--value`), `list` (solo i nomi, MAI i valori), `get` (stampa un
  valore, pipeable), `download` (`--format env|json`, su file o stdout — avvisa che il file contiene
  plaintext), `delete`, `import` (bulk **all-or-nothing** da `.env`/JSON via `--from-file`). Nuovo comando
  top-level **`run`**: `cyi run -p <prj> -e <env> -- <comando>` scarica i secret di `[progetto, ambiente]`
  e li inietta come variabili d'ambiente nel sottoprocesso (stdio ereditato, exit code propagato) **senza
  scriverli su disco** — l'equivalente di `doppler run`. Flag condiviso `--environment/-e` (code o UUID,
  risolto dal backend). Richiede closeyourit-rails col dominio `Secrets::` (`/cli/v1/projects/:id/secrets`).

## [0.0.22] - 2026-07-08

### Aggiunto
- **Pallini di stato + emoji di sezione nell'output umano** (l'output `--json` resta invariato). Ogni colonna
  STATUS nelle liste (`errors`, `monitors`, `cron-monitors`, `ideas`, `servers`, `agents runs`, `agents`,
  `tokens`, `tickets`) e ogni campo `status`/`level`/`phase`/`priority` nei record di show/create/update porta
  ora un pallino **🔴🟡🟢⚪** (rosso = problema/giù/fallito, giallo = in corso/in ritardo, verde = ok/su/fatto,
  bianco = neutro/sconosciuto/in pausa), per individuare i problemi a colpo d'occhio. Gli status di monitoring
  (stringhe-enum stabili) sono mappati lato CLI; lo status/priority dei **ticket** usa il colore del badge
  (`status_color`/`priority_color`, esposto dal backend ≥ closeyourit-rails 0.0.146) → fedele anche con le label
  rinominate dall'org. Le show multi-sezione (`tickets show`, `ideas show`, `kb ask`) hanno un'emoji
  sull'intestazione: 📝 Description · 🔧 Technical analysis · 🧪 Scenario · ✅ Definition of Done · 💬 Comments ·
  📎 Attachments · 🎯 Problem · 💡 Solution · 👥 Stakeholders · 📚 Sources.

## [0.0.21] - 2026-07-08

### Aggiunto
- **`agents tokens`** — token org dell'automator (`cyi_a_`), analogo org-level a `servers tokens`.
  `agents tokens list`, `agents tokens create <name>` (segreto mostrato una sola volta),
  `agents tokens revoke <id> --confirm`. Contro `/cli/v1/agents/tokens`, gated `agents.manage` lato backend.

## [0.0.20] - 2026-07-08

### Aggiunto
- **Comandi GitHub** (parità con la nuova integrazione GitHub del backend). `projects github --project <id|key>`
  mostra lo stato dell'integrazione del progetto (repo agganciato + regole di binding tag→release);
  `projects github-update` aggiorna le regole (`--default-branch`, `--production-environment-id`,
  `--staging-environment-id`, `--sync-enabled`/`--tag-binding-enabled`/`--autoclose-on-merge`, solo i campi
  passati). `tickets branch <id|code>` crea un branch GitHub dal ticket (nome prefissato col codice);
  `tickets pr <id|code>` apre una pull request dal branch del ticket. Tutti gated `github.manage` lato backend.

## [0.0.19] - 2026-07-07

### Cambiato
- **`tickets create` / `tickets update`**: il corpo BDD passa da un singolo Given/When/Then/Expected a
  **scenari multipli**. Nuovo flag `--scenarios` (array JSON `[{title,step_given,step_when,step_then,step_expected}]`);
  le scorciatoie `--step-given/when/then/expected` restano ma ora costruiscono **un singolo scenario**
  (retro-compatibili). Nuovi flag `--technical-analysis` (registro tecnico separato), `--condition`
  (riga Definition of Done, **ripetibile**), e `--due-at`. Flag corpo condivisi tra create/update.
- **`tickets show`**: rende ora **N scenari** (un blocco per scenario coi soli step presenti), la
  **Definition of Done** (bullet) e l'**analisi tecnica**, al posto delle 4 clausole piatte.

### Nota
- Il backend `/cli/v1` non espone più `step_*` piatti ma `scenarios`/`conditions`/`technical_analysis`
  (richiede rails ≥ 0.0.134).

### Aggiunto
- **Topic `agents`** — gestione degli agenti di automazione (dominio `Agents::` del backend rails,
  eseguiti dal daemon closeyourit-automator). Comandi: `agents list [--kind]`, `agents show <id>`,
  `agents create` (con `--project`/`--group` risolti a id, `--kind`, `--run`, `--schedule`,
  `--timeout`, `--model`, `--permission-mode`, `--allowed-tool…`, `--on-failure`, `--catch-up`,
  `--no-enabled`), `agents update <id>` (solo i flag passati), `agents assign <id>`,
  `agents delete <id> --confirm`, e `agents runs list|show`. Contro `/cli/v1/agents` (token utente),
  gated `agents.view`/`agents.manage` lato backend.

## [0.0.17] - 2026-07-06

### Aggiunto
- **Parità completa col canale CLI del backend (rails ≥ v0.0.112)** — ~68 comandi nuovi che coprono
  l'intera superficie `/cli/v1` dell'area member, oltre a flag mancanti su comandi esistenti.
  - **Topic nuovi**: `analytics` (show · goals list/create/delete · share/unshare),
    `uptime-groups` (CRUD + publish/unpublish della status page), `releases` (list),
    `cron-monitors` (list/show), `todos` (liste personali: CRUD · items add/list/update/delete ·
    sharing · complete/uncomplete · reorder · liste condivise).
  - **alerts**: `alerts notifications` (list · read · read-all · delete) e `alerts preferences`
    (show · update, incl. quiet hours).
  - **logs**: `logs show`, `logs link`/`unlink` (collega un log a un errore o ticket).
  - **monitors**: `publish`/`unpublish`, `announcements` (show/set/clear),
    `incidents` (delete · group · ungroup · update-add · update-delete), flag `--group-id` su create/update.
  - **members**: `update`, `remove`; `set-access` esteso con `--role-id` (ripetibile) e
    `--override key=allow|deny|inherit`.
  - **tickets**: `links`/`unlink`, `reviewer`/`unreviewer`, `watch`/`unwatch`.
  - **projects**: `settings` (show/update: retention + flag funzionalità), `link-server`/`unlink-server`,
    flag `--roadmap-enabled`/`--quick-bug-report-enabled` su create/update.
  - **ideas**: `delete`, `archive`/`unarchive`, `case-update`/`case-delete`.
  - Flag aggiunti: `groups --roadmap-enabled`, `platforms --supports-uptime`,
    `org --logs-retention-days`/`--analytics-retention-days`.

## [0.0.16] - 2026-07-03

### Aggiunto
- **`ideas update` — modifica di un'idea** — `cyi ideas update <idea-id> --project <p> --title …
  --problem … --solution … --stakeholders … --stakeholders …` (PUT `/cli/v1/projects/:p/ideas/:id`).
  Full replace di title/problem/solution (i campi omessi vengono azzerati lato server; omettere
  `--problem`/`--title` → 422, fail-safe); `--stakeholders` (ripetibile) sostituisce la lista solo se
  passato. Solo idee aperte; l'autore modifica la propria, altrimenti serve `ideas.edit`.
- **`ideas case` — aggiunta di un case** — `cyi ideas case <idea-id> --project <p> --title …
  [--description …]` (POST `/cli/v1/projects/:p/ideas/:id/cases`). Un case è un esempio/scenario
  (titolo + descrizione), aggiunto uno alla volta come i commenti; stesso gate della modifica idea.
  Richiede il backend rails ≥ v0.0.103.

### Corretto
- **`opencli.json` — manifest allineato** — la voce `ideas create` mostrava ancora `--body`: ora
  riflette `--problem`/`--solution`/`--stakeholders` (già attivi da 0.0.15) e include `ideas update` /
  `ideas case`.

## [0.0.15] - 2026-07-03

### Modificato
- **`ideas create` — nuovi campi (allineamento al backend v0.0.99)** — il backend è passato a un
  formato idea strutturato: il flag `--body` (obbligatorio) è sostituito da `--problem` (obbligatorio)
  + `--solution` (opzionale) + `--stakeholders` (opzionale, ripetibile). Il POST invia
  `{title, problem, solution, stakeholders[]}`. **Breaking**: `ideas create --body` non funziona più
  (il backend richiede `problem`).
- **`ideas show`** — mostra Problema, Soluzione e Stakeholder al posto del vecchio blocco "Proposal"
  (il campo `body` non esiste più nel serializer).

## [0.0.14] - 2026-07-03

### Aggiunto
- **Topic `cyi kb`** — knowledge base di progetto (note, decisioni, guide) da terminale:
  `kb list` (cross-progetto: senza `--project` copre ogni progetto visibile; filtri `--kind`
  ripetibile o comma-separato, `--per`/`--page`) · `kb search <query…>` (ricerca **semantica** con
  fallback ILIKE sul titolo, la query è variadica; stampa un hint quando il server ripiega sull'ILIKE)
  · `kb show <id>` (header dei metadati + body markdown grezzo) · `kb create --project --title
  (--body | --body-file) [--kind]` (kind default `note`) · `kb update <id>` (aggiorna solo i campi
  passati: legge la pagina e ri-invia title/body/kind correnti per i mancanti) · `kb delete <id>
  --confirm`.
- **`cyi kb ask <domanda…>`** — domanda in linguaggio naturale: l'AI server-side risponde attingendo
  alla knowledge base e cita le pagine usate; con `insufficient` stampa un messaggio dedicato quando
  non ha abbastanza contesto. Richiede backend con `POST /cli/v1/knowledge/ask`.

## [0.0.13] - 2026-07-02

### Aggiunto
- **Topic `cyi ideas`** — idee di progetto votabili e commentabili dal team, convertibili in ticket:
  `ideas list` (ordinamento per voti, filtro `--status`, `--sort recent`) · `ideas show` (campi +
  corpo proposta) · `ideas create --title --body` · `ideas vote`/`unvote` (idempotenti, solo idee
  aperte) · `ideas comment --body` · `ideas comments` (discussione completa, tutte le pagine) ·
  `ideas comment-delete --comment-id --confirm`.
- **`cyi ideas convert <id>`** — promuove l'idea a ticket: senza `--title/--description` la bozza
  viene **sintetizzata dall'AI server-side** (idea + commenti, ~30s); con la bozza esplicita l'AI
  non viene chiamata. Flag `--kind/--status-id/--priority-id` opzionali (default: feature se il
  progetto ha roadmap altrimenti bug, status open, priority medium). Converte l'autore o chi ha
  `ideas.convert`. Richiede backend ≥ 0.0.81.

## [0.0.12] - 2026-07-02

### Aggiunto
- **`cyi tickets reject <id|code> --reason "…"`** — respinge la review di un ticket: torna sul primo
  status in progress, il motivo diventa un commento in discussione e l'assignee riceve una notifica
  dedicata col motivo. Richiede backend con `POST /cli/v1/.../review/rejection`.
- **`cyi tickets approve <id|code>`** — approva la review: il ticket passa sul primo status done.
  Richiede backend con `POST /cli/v1/.../review/approval`.

## [0.0.11] - 2026-07-02

### Aggiunto
- **`cyi tickets show` sempre completo** — un solo comando stampa TUTTO il ticket: campi (status,
  priority, weight, votes, assignee/reporter/reviewer, milestone, platforms), blocco Description,
  le 4 clausole BDD (Given/When/Then/Expected), i commenti con i loro file allegati e la tabella
  allegati. `--json` ritorna il payload unito `{data: {...ticket, comments, attachments}}`.
  Richiede backend ≥ 0.0.78.
- **`cyi tickets comments`** mostra i file allegati a ogni commento (id · filename · content type ·
  byte) — scaricabili con `tickets attachment-download`, che ora risolve anche i file dei commenti.
- **Ticket per code ovunque** — show/comments/attachment-download (e gli altri sub-comandi) accettano
  il code umano (es. `DRFL-3`) oltre all'UUID.

### Tecnico
- `sanitize`/`sanitizeMultiline` esportate da `lib/output`: i corpi multiriga (description, clausole,
  body dei commenti) preservano i newline ma neutralizzano i control char (CWE-150); il comando
  `comments` ora sanifica anche header e body (prima stampava raw).

## [0.0.10] - 2026-07-02

### Aggiunto
- **`cyi alerts channels list|create|delete`** — canali esterni (webhook firmato / Telegram) da
  terminale; il create accetta `--bot-token`/`--chat-id` o `--url`/`--secret`.
- **`cyi alerts create|update`**: whitelist `--event-type` completa (uptime_ssl_expiring,
  cron_missed e gli 8 `server_*`), nuovo `--threshold` (soglie server: % o °C) e `--channel`
  ripetibile per agganciare i canali esterni alla regola (REPLACE del set).
  Richiede backend ≥ 0.0.74.

## [0.0.9] - 2026-07-02

### Aggiunto
- **`cyi servers …`** — gestione della flotta di server monitoring da terminale: `list` (snapshot
  cpu/mem/disk con filtro `--status`), `show`, `rename`, `pause`/`resume`, `revoke`/`unrevoke`
  (l'agent riceve 403 e si ferma), `delete --confirm`; **`cyi servers tokens list|create|revoke`**
  per gli enrollment token universali (il segreto `cyi_s_…` è mostrato una sola volta al create).
  Richiede backend ≥ 0.0.71.

## [0.0.8] - 2026-07-02

### Aggiunto
- **`projects set-platforms`** — dichiara le piattaforme del progetto (`--code`/`--platform-id`
  ripetibili, SET completo). Sblocca la creazione dei monitor uptime da CLI (che richiedono una
  piattaforma web/server dichiarata). Richiede backend ≥ 0.0.62.
- **`monitors create`**: nuovi campi supportati dal backend (`--expected-body-keyword`,
  `--ssl-expiry-warn-days`) — vedi sotto.

### Interno
- Suite test dei comandi oclif: 338 test, coverage gate 95/90 (lines/branches) esteso a src/commands.

## [0.0.7] - 2026-07-02

### Aggiunto
- **Ticket: lettura commenti e download allegati.** `tickets comments <ticket>` elenca la
  discussione; `tickets attachment-download <ticket> <attachment>` scarica un allegato su file.

## [0.0.6] - 2026-06-30

### Sicurezza
- **Output hardening (CWE-150).** Le celle renderizzate in tabella vengono ripulite dalle sequenze
  di controllo del terminale: un dato remoto ostile non può più iniettare ANSI escape nell'output.

## [0.0.5] - 2026-06-30

### Aggiunto
- **`logs list`** — stream dei log strutturati cross-app (filtri livello/environment/progetto).

## [0.0.4] - 2026-06-29

### Aggiunto
- **Parità con la web app**: comandi `monitors` (CRUD + pause/resume), `alerts`, `members`,
  `invitations resend`, `milestones`, `platforms`/`environments`/`org` (CRUD/show/update),
  lifecycle ticket completo (`assign`/`status`/`milestone`/`vote`) + `errors promote`,
  allegati ticket (`attach`/`detach`, multipart in `api.ts`), `groups update/delete`.

### Modificato
- `projects create`: `--key` obbligatorio (niente più derivazione automatica dal nome).
- Id-or-code sempre `encodeURIComponent` negli URL.

## [0.0.3] - 2026-06-28

### Modificato
- **Publish npm via OIDC trusted publishing** — rimosso il token long-lived `NPM_TOKEN`.

## [0.0.2] - 2026-06-28

### Aggiunto
- `projects set-environments` — dichiara gli environment del progetto.
- Comandi RBAC: `roles`, `teams`, `members`, `invitations`.
- `groups create/list`, `projects create`.

### Modificato
- CI su runner self-hosted.

## [0.0.1] - 2026-06-28

### Aggiunto
- Scaffold iniziale CLI `cyi` (oclif + TypeScript): auth device-flow (`login`/`logout`/`whoami`),
  `projects`, `errors`, `tickets`, `tokens`, lookup types. Pubblicabile su npm
  (`@bussolabs/closeyourit-cli`, `--access public`).
