#### step.1 build contract
```shell
npm run fcontract:build2
```

#### step.2 build Aspect and run test
```shell
npm run aspect:build && node tests/test_tx.cjs
```

#### step.3 display game map

eit `.env`, modify actual `CONTRACT`

```shell
npm run Counter:display
```
👆this command will real-time query contract and display game map.

#### step.4 move player
```shell
npm run Counter:moveDown
```

#### expect test result

will display two red number on map, which means there are two player!