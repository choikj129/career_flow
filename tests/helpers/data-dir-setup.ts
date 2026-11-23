import { makeTmpDir } from './tmp';

// 테스트는 실제 앱 데이터(data/)를 절대 쓰지 않는다. 테스트 파일이 설정(@/lib/config)을 읽기 전에
// 데이터 폴더를 임시 폴더로 정한다. 파일이 끝나면 tmp-setup.ts가 지운다.
process.env.CAREER_FLOW_DATA_DIR = makeTmpDir('cf-data-');
